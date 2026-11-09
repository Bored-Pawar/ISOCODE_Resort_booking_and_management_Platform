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
    vi.spyOn(booking, "listForGuest");
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
    // No precheck outside the transaction: reuse lives inside acquireHold (01 Contract note 7).
    expect(booking.listForGuest).not.toHaveBeenCalled();
  });

  it("a double submit goes through acquireHold both times and lands on the same hold", async () => {
    vi.mocked(requireRole).mockResolvedValue(guest);
    vi.spyOn(booking, "listForGuest");
    // acquireHold returns the same live booking for the same guest and exact stay.
    vi.mocked(acquireBookingHold).mockResolvedValue({ ok: true, booking: bookingFixture });
    const both = await Promise.allSettled([
      holdStay(undefined, form({ query })),
      holdStay(undefined, form({ query })),
    ]);
    expect(both.map((r) => (r.status === "rejected" ? String(r.reason) : "no redirect"))).toEqual(
      Array(2).fill(`Error: REDIRECT /book/pay/${bookingFixture.ref}`),
    );
    expect(acquireBookingHold).toHaveBeenCalledTimes(2);
    expect(booking.listForGuest).not.toHaveBeenCalled();
  });

  it("sends sold out back to /rooms with the cart and a notice", async () => {
    vi.mocked(requireRole).mockResolvedValue(guest);
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
    expect(await holdStay(undefined, form({}))).toEqual({ step: { kind: "error" }, attempt: 1 });
    expect(await holdStay(undefined, form({ query: "checkIn=2099-11-14" }))).toEqual({
      step: { kind: "error" },
      attempt: 1,
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
    // The typed phone comes back so the field keeps it after React resets the form.
    expect(bad).toEqual({ phoneError: "Enter a valid phone number", phone: "12", attempt: 1 });
    expect(acquireBookingHold).not.toHaveBeenCalled();

    vi.mocked(acquireBookingHold).mockResolvedValue({ ok: false, code: "INVALID_INPUT" });
    await holdStay(undefined, form({ query, phone: "98450 12345", phoneBefore: "98450 12345" }));
    expect(updateGuestPhone).not.toHaveBeenCalled();
    await holdStay(undefined, form({ query, phone: "+91 98450 12345", phoneBefore: "" }));
    expect(updateGuestPhone).toHaveBeenCalledWith("guest-1", "+91 98450 12345");
  });
});

describe("hold rate limit (H2)", () => {
  it("a rate-limited hold says so and never reaches acquireBookingHold", async () => {
    const { resetRateLimits, RATE_LIMITED_MESSAGE } = await import("@/lib/rate-limit");
    resetRateLimits();
    vi.mocked(requireRole).mockResolvedValue({ ...guest, id: "guest-flood" });
    vi.mocked(acquireBookingHold).mockResolvedValue({ ok: false, code: "SOLD_OUT" } as never);
    for (let i = 0; i < 20; i++) await holdStay(undefined, form({ query })).catch(() => undefined);
    const calls = vi.mocked(acquireBookingHold).mock.calls.length;
    expect(await holdStay(undefined, form({ query }))).toMatchObject({
      message: RATE_LIMITED_MESSAGE,
    });
    expect(vi.mocked(acquireBookingHold).mock.calls.length).toBe(calls);
    resetRateLimits();
  });
});
