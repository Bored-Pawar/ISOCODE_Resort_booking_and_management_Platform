import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/auth/profile", () => ({ updateGuestPhone: vi.fn() }));
vi.mock("@/modules/booking/actions", () => ({ acquireBookingHold: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT ${href}`);
  }),
}));

import { requireRole } from "@/lib/auth";
import { updateGuestPhone } from "@/lib/auth/profile";
import { booking } from "@/modules/booking";
import { acquireBookingHold } from "@/modules/booking/actions";
import { bookingFixture } from "@/modules/booking/fixtures";
import { holdStay } from "./actions";

const guest = { id: "guest-1", role: "guest" as const, email: "g@x.example", name: "G" };
const query =
  "checkIn=2099-11-14&checkOut=2099-11-16&adults=2&children=0&room=rt-a.rp-a.2.0&quoteHash=h1";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(requireRole).mockReset();
  vi.mocked(acquireBookingHold).mockReset();
  vi.mocked(updateGuestPhone).mockReset();
});

describe("holdStay", () => {
  it("holds with the session guest and the URL quoteHash, then goes to pay", async () => {
    vi.mocked(requireRole).mockResolvedValue(guest);
    vi.spyOn(booking, "listForGuest").mockResolvedValue({ ok: true, bookings: [] });
    vi.mocked(acquireBookingHold).mockResolvedValue({ ok: true, booking: bookingFixture });
    await expect(holdStay(undefined, form({ query, guestId: "forged" }))).rejects.toThrow(
      `REDIRECT /book/pay/${bookingFixture.ref}`,
    );
    expect(requireRole).toHaveBeenCalledWith("guest");
    expect(acquireBookingHold).toHaveBeenCalledWith({
      stay: {
        checkIn: "2099-11-14",
        checkOut: "2099-11-16",
        promoCode: undefined,
        rooms: [{ roomTypeId: "rt-a", ratePlanId: "rp-a", adults: 2, children: 0 }],
      },
      quoteHash: "h1",
    });
    expect(booking.listForGuest).toHaveBeenCalledWith({ guestId: "guest-1", limit: 50 });
  });

  it("reuses a live hold for the same priced stay instead of holding again", async () => {
    vi.mocked(requireRole).mockResolvedValue(guest);
    const live = {
      ...bookingFixture,
      ref: "CA-AGAIN",
      status: "HELD" as const,
      checkIn: "2099-11-14",
      checkOut: "2099-11-16",
      quoteHash: "h1",
      holdExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    vi.spyOn(booking, "listForGuest").mockResolvedValue({ ok: true, bookings: [live] });
    await expect(holdStay(undefined, form({ query }))).rejects.toThrow(
      "REDIRECT /book/pay/CA-AGAIN",
    );
    expect(acquireBookingHold).not.toHaveBeenCalled();
  });

  it("sends sold out back to /rooms with the cart and a notice", async () => {
    vi.mocked(requireRole).mockResolvedValue(guest);
    vi.spyOn(booking, "listForGuest").mockResolvedValue({ ok: true, bookings: [] });
    vi.mocked(acquireBookingHold).mockResolvedValue({
      ok: false,
      code: "SOLD_OUT",
      roomTypeId: "rt-a",
    });
    await expect(holdStay(undefined, form({ query }))).rejects.toThrow(
      /REDIRECT \/rooms\?.*room=rt-a\.rp-a\.2\.0.*notice=sold-out\.rt-a/,
    );
  });

  it("validates input first and never holds on a broken query", async () => {
    vi.mocked(requireRole).mockResolvedValue(guest);
    expect(await holdStay(undefined, form({}))).toEqual({ step: { kind: "error" } });
    expect(await holdStay(undefined, form({ query: "checkIn=2099-11-14" }))).toEqual({
      step: { kind: "error" },
    });
    expect(acquireBookingHold).not.toHaveBeenCalled();
  });

  it("rejects a signed-out request", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("UNAUTHENTICATED"));
    await expect(holdStay(undefined, form({ query }))).rejects.toThrow("UNAUTHENTICATED");
    expect(acquireBookingHold).not.toHaveBeenCalled();
  });

  it("updates only a changed phone, and reports a bad one without holding", async () => {
    vi.mocked(requireRole).mockResolvedValue(guest);
    const bad = await holdStay(undefined, form({ query, phone: "12", phoneBefore: "" }));
    expect(bad).toEqual({ phoneError: "Enter a valid phone number" });
    expect(acquireBookingHold).not.toHaveBeenCalled();

    vi.spyOn(booking, "listForGuest").mockResolvedValue({ ok: true, bookings: [] });
    vi.mocked(acquireBookingHold).mockResolvedValue({ ok: false, code: "INVALID_INPUT" });
    await holdStay(undefined, form({ query, phone: "98450 12345", phoneBefore: "98450 12345" }));
    expect(updateGuestPhone).not.toHaveBeenCalled();
    await holdStay(undefined, form({ query, phone: "+91 98450 12345", phoneBefore: "" }));
    expect(updateGuestPhone).toHaveBeenCalledWith("guest-1", "+91 98450 12345");
  });
});
