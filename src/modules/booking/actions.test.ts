import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ requireRole: vi.fn() }));
import { requireRole } from "@/lib/auth";
import { booking } from "./index";
import { acquireBookingHold } from "./actions";

const input = {
  stay: {
    roomTypeId: "r",
    ratePlanId: "p",
    checkIn: "2099-11-14",
    checkOut: "2099-11-16",
    adults: 2,
  },
  quoteHash: "hash",
};
afterEach(() => {
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
      stay: { ...input.stay, children: 0 },
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
});
