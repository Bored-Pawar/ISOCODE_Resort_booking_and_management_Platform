import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ requireRole: vi.fn() }));
import { requireRole } from "@/lib/auth";
import { booking } from "./index";
import { acquireBookingHold, cancelHeldBooking } from "./actions";

const input = {
  stay: {
    checkIn: "2099-11-14",
    checkOut: "2099-11-16",
    rooms: [
      { roomTypeId: "r", ratePlanId: "p", adults: 2 },
      { roomTypeId: "r2", ratePlanId: "p2", adults: 1, children: 1 },
    ],
  },
  quoteHash: "hash",
};
beforeEach(() => {
  // Inside the 3 month online window for the 2099-11-14 check-in.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-10-01T06:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(requireRole).mockReset();
});
describe("hold server action", () => {
  it("takes identity only from the verified guest session, ignoring a forged payload ID", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      id: "verified-guest",
      role: "guest",
      email: "g@test.example",
      name: "Guest",
    });
    const service = vi
      .spyOn(booking, "acquireHold")
      .mockResolvedValue({ ok: false, code: "SOLD_OUT" });
    expect(await acquireBookingHold({ ...input, guestId: "attacker-selected" })).toEqual({
      ok: false,
      code: "SOLD_OUT",
    });
    expect(requireRole).toHaveBeenCalledWith("guest");
    expect(service).toHaveBeenCalledWith({
      ...input,
      stay: {
        ...input.stay,
        rooms: [{ ...input.stay.rooms[0], children: 0 }, input.stay.rooms[1]],
      },
      guestId: "verified-guest",
    });
  });
  it("rejects an unauthenticated request before calling booking", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("UNAUTHENTICATED"));
    const service = vi.spyOn(booking, "acquireHold");
    await expect(acquireBookingHold(input)).rejects.toThrow("UNAUTHENTICATED");
    expect(service).not.toHaveBeenCalled();
  });
  it("validates browser input before calling the service", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      id: "guest",
      role: "guest",
      email: "g@test.example",
      name: "Guest",
    });
    const service = vi.spyOn(booking, "acquireHold");
    expect(await acquireBookingHold({ ...input, quoteHash: "" })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(service).not.toHaveBeenCalled();
  });
  it("refuses a check-in more than 3 months ahead before calling the service", async () => {
    vi.setSystemTime(new Date("2099-08-13T06:00:00Z")); // last online check-in 2099-11-13
    vi.mocked(requireRole).mockResolvedValue({
      id: "guest",
      role: "guest",
      email: "g@test.example",
      name: "Guest",
    });
    const service = vi.spyOn(booking, "acquireHold");
    expect(await acquireBookingHold(input)).toEqual({
      ok: false,
      code: "OUTSIDE_WINDOW",
      message: "Online booking opens 3 months ahead. For later dates, send us an enquiry.",
    });
    expect(service).not.toHaveBeenCalled();
  });
});

describe("cancel server action", () => {
  const id = "4f6c2a8e-1b3d-4c5e-9f7a-0b1c2d3e4f5a";
  it("cancels as the session guest only", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      id: "verified-guest",
      role: "guest",
      email: "g@test.example",
      name: "Guest",
    });
    const service = vi
      .spyOn(booking, "cancelHeld")
      .mockResolvedValue({ ok: false, code: "FORBIDDEN" });
    expect(await cancelHeldBooking({ bookingId: id, guestId: "attacker" })).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(service).toHaveBeenCalledWith(
      { bookingId: id },
      { userId: "verified-guest", role: "guest" },
    );
    expect(await cancelHeldBooking({ bookingId: "nope" })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(service).toHaveBeenCalledTimes(1);
  });
  it("rejects a signed-out request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("UNAUTHENTICATED"));
    const service = vi.spyOn(booking, "cancelHeld");
    await expect(cancelHeldBooking({ bookingId: id })).rejects.toThrow("UNAUTHENTICATED");
    expect(service).not.toHaveBeenCalled();
  });
});
