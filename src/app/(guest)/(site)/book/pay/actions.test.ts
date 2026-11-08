import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireRole: vi.fn() }));
vi.mock("@/modules/booking/actions", () => ({ acquireBookingHold: vi.fn() }));
vi.mock("@/modules/payments", async (orig) => {
  const real = await orig<typeof import("@/modules/payments")>();
  return { ...real, MockProvider: vi.fn() };
});
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT ${href}`);
  }),
}));

import { requireRole } from "@/lib/auth";
import { booking, type Booking } from "@/modules/booking";
import { acquireBookingHold } from "@/modules/booking/actions";
import { bookingFixture } from "@/modules/booking/fixtures";
import { MockProvider } from "@/modules/payments";
import { checkPayment, payBooking, refreshHold } from "./actions";
import { payGate } from "../../../_lib/pay-flow";

const guest = { id: "guest-1", role: "guest" as const, email: "g@x.example", name: "G" };
const charge = vi.fn();
const attemptId = randomUUID();

function heldFor(ms: number): Booking {
  return {
    ...bookingFixture,
    ref: "CA-ABCDE",
    status: "HELD",
    holdExpiresAt: new Date(Date.now() + ms).toISOString(),
  };
}
function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
const payForm = (outcome = "succeeds") => form({ ref: "CA-ABCDE", outcome, attemptId });

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue(guest);
  vi.mocked(MockProvider).mockImplementation(function (this: unknown) {
    return { name: "mock", charge } as never;
  } as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  charge.mockReset();
  vi.mocked(acquireBookingHold).mockReset();
});

describe("payGate", () => {
  it("is open, gated under 2 minutes, ended at zero or when not HELD", () => {
    const now = Date.now();
    expect(payGate(heldFor(120_001), now)).toBe("open");
    expect(payGate(heldFor(119_000), now)).toBe("gated");
    expect(payGate(heldFor(-1), now)).toBe("ended");
    expect(payGate({ ...heldFor(600_000), status: "EXPIRED" }, now)).toBe("ended");
  });
});

describe("payBooking", () => {
  it("charges exactly the saved total with the form's attempt id, then confirms", async () => {
    const b = heldFor(600_000);
    vi.spyOn(booking, "get")
      .mockResolvedValueOnce({ ok: true, booking: b })
      .mockResolvedValueOnce({ ok: true, booking: { ...b, status: "CONFIRMED" } });
    charge.mockResolvedValue({ status: "SUCCESS", providerPaymentId: "p", amountPaise: 1 });
    const fd = payForm();
    fd.set("amountPaise", "1"); // ignored: the browser never sets the amount
    await expect(payBooking(undefined, fd)).rejects.toThrow("REDIRECT /booking/CA-ABCDE");
    expect(MockProvider).toHaveBeenCalledWith({ outcome: "succeeds", attemptId });
    expect(charge).toHaveBeenCalledWith({ bookingId: b.id, amountPaise: b.totalPaise });
    expect(booking.get).toHaveBeenCalledWith(
      { ref: "CA-ABCDE" },
      { userId: "guest-1", role: "guest" },
    );
  });

  it("rechecks the 2 minute gate on the server and charges nothing", async () => {
    vi.spyOn(booking, "get").mockResolvedValue({ ok: true, booking: heldFor(60_000) });
    expect(await payBooking(undefined, payForm())).toEqual({ step: { kind: "gated" } });
    vi.spyOn(booking, "get").mockResolvedValue({ ok: true, booking: heldFor(-1000) });
    expect(await payBooking(undefined, payForm())).toEqual({ step: { kind: "ended" } });
    expect(charge).not.toHaveBeenCalled();
  });

  it("someone else's ref finds nothing and charges nothing", async () => {
    vi.spyOn(booking, "get").mockResolvedValue({ ok: false, code: "FORBIDDEN" });
    expect((await payBooking(undefined, payForm()))?.step?.kind).toBe("error");
    expect(charge).not.toHaveBeenCalled();
  });

  it("maps declined, timeout and a late success", async () => {
    const b = heldFor(600_000);
    vi.spyOn(booking, "get").mockResolvedValue({ ok: true, booking: b });
    charge.mockResolvedValueOnce({ status: "FAILED", providerPaymentId: "p", reason: "x" });
    expect(await payBooking(undefined, payForm("declined"))).toEqual({
      step: { kind: "declined" },
    });
    charge.mockResolvedValueOnce({ status: "TIMEOUT" });
    expect(await payBooking(undefined, payForm("timeout"))).toEqual({
      step: { kind: "timeout" },
    });
    vi.spyOn(booking, "get")
      .mockResolvedValueOnce({ ok: true, booking: b })
      .mockResolvedValueOnce({ ok: true, booking: { ...b, status: "EXPIRED" } });
    charge.mockResolvedValueOnce({ status: "SUCCESS", providerPaymentId: "p", amountPaise: 1 });
    expect(await payBooking(undefined, payForm())).toEqual({ step: { kind: "refund-pending" } });
  });

  it("validates input and requires the guest session", async () => {
    expect((await payBooking(undefined, form({ ref: "x", outcome: "succeeds" })))?.step?.kind).toBe(
      "error",
    );
    vi.mocked(requireRole).mockRejectedValue(new Error("UNAUTHENTICATED"));
    await expect(payBooking(undefined, payForm())).rejects.toThrow("UNAUTHENTICATED");
    expect(charge).not.toHaveBeenCalled();
  });

  it("a confirmed booking goes straight to its confirmation (double click)", async () => {
    vi.spyOn(booking, "get").mockResolvedValue({
      ok: true,
      booking: { ...heldFor(0), status: "CONFIRMED", holdExpiresAt: null },
    });
    await expect(payBooking(undefined, payForm())).rejects.toThrow("REDIRECT /booking/CA-ABCDE");
    expect(charge).not.toHaveBeenCalled();
  });
});

describe("checkPayment and refreshHold", () => {
  it("check status re-reads the booking", async () => {
    vi.spyOn(booking, "get").mockResolvedValue({ ok: true, booking: heldFor(600_000) });
    expect(await checkPayment("CA-ABCDE")).toEqual({ step: { kind: "timeout" } });
    vi.spyOn(booking, "get").mockResolvedValue({
      ok: true,
      booking: { ...heldFor(0), status: "CANCELLED" },
    });
    expect(await checkPayment("CA-ABCDE")).toEqual({ step: { kind: "ended" } });
  });

  it("refresh cancels first, then holds the same cart again at the price seen", async () => {
    const b = heldFor(60_000);
    vi.spyOn(booking, "get").mockResolvedValue({ ok: true, booking: b });
    vi.spyOn(booking, "listForGuest");
    const order: string[] = [];
    vi.spyOn(booking, "cancelHeld").mockImplementation(async () => {
      order.push("cancel");
      return { ok: true, booking: { ...b, status: "CANCELLED" } };
    });
    vi.mocked(acquireBookingHold).mockImplementation(async () => {
      order.push("hold");
      return { ok: true, booking: { ...b, ref: "CA-FRESH" } };
    });
    await expect(refreshHold(undefined, form({ ref: "CA-ABCDE" }))).rejects.toThrow(
      "REDIRECT /book/pay/CA-FRESH",
    );
    expect(order).toEqual(["cancel", "hold"]);
    expect(booking.cancelHeld).toHaveBeenCalledWith(
      { bookingId: b.id },
      { userId: "guest-1", role: "guest" },
    );
    expect(vi.mocked(acquireBookingHold).mock.calls[0][0]).toMatchObject({
      quoteHash: b.quoteHash,
      stay: { checkIn: b.checkIn, checkOut: b.checkOut },
    });
    expect(booking.listForGuest).not.toHaveBeenCalled();
  });

  it("refresh that loses the last unit goes back to /rooms with the notice", async () => {
    const b = heldFor(60_000);
    vi.spyOn(booking, "get").mockResolvedValue({ ok: true, booking: b });
    vi.spyOn(booking, "cancelHeld").mockResolvedValue({
      ok: true,
      booking: { ...b, status: "CANCELLED" },
    });
    vi.mocked(acquireBookingHold).mockResolvedValue({ ok: false, code: "SOLD_OUT" });
    await expect(refreshHold(undefined, form({ ref: "CA-ABCDE" }))).rejects.toThrow(
      /REDIRECT \/rooms\?.*notice=sold-out/,
    );
  });

  it("refresh is refused while the hold still has more than 2 minutes", async () => {
    vi.spyOn(booking, "get").mockResolvedValue({ ok: true, booking: heldFor(600_000) });
    const cancel = vi.spyOn(booking, "cancelHeld");
    expect((await refreshHold(undefined, form({ ref: "CA-ABCDE" })))?.message).toMatch(
      /still has time/,
    );
    expect(cancel).not.toHaveBeenCalled();
    expect(acquireBookingHold).not.toHaveBeenCalled();
  });

  it("a second refresh (other tab, or an old ref) goes through acquireHold, which reuses the replacement", async () => {
    const old = { ...heldFor(0), status: "CANCELLED" as const, holdExpiresAt: null };
    vi.spyOn(booking, "get").mockResolvedValue({ ok: true, booking: old });
    const cancel = vi.spyOn(booking, "cancelHeld");
    vi.spyOn(booking, "listForGuest");
    // acquireHold is idempotent per guest and exact stay: it returns the first refresh's hold.
    vi.mocked(acquireBookingHold).mockResolvedValue({
      ok: true,
      booking: { ...heldFor(600_000), ref: "CA-FRESH" },
    });
    await expect(refreshHold(undefined, form({ ref: "CA-ABCDE" }))).rejects.toThrow(
      "REDIRECT /book/pay/CA-FRESH",
    );
    expect(cancel).not.toHaveBeenCalled();
    expect(acquireBookingHold).toHaveBeenCalledTimes(1);
    expect(booking.listForGuest).not.toHaveBeenCalled();
  });
});
