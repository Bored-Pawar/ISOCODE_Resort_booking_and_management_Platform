/**
 * B6 step 3 rules shared by the pay page, its server actions and tests. Pure; types only.
 */
import { HOLD_WARNING_MS } from "@/components/ui/hold-latch";
import type { Booking } from "@/modules/booking";
import type { CartLine, CartStay } from "./cart";

/**
 * open: Pay is allowed. gated: under 2 minutes left, Pay is disabled and "Refresh hold" shows
 * (01 late payment rule). ended: the hold is no longer valid.
 */
export type PayGate = "open" | "gated" | "ended";

export function payGate(b: Pick<Booking, "status" | "holdExpiresAt">, now: number): PayGate {
  if (b.status !== "HELD" || !b.holdExpiresAt) return "ended";
  const left = Date.parse(b.holdExpiresAt) - now;
  if (left <= 0) return "ended";
  return left < HOLD_WARNING_MS ? "gated" : "open";
}

/** What the pay form shows after an attempt that did not leave the page. */
export type PayStep =
  | { kind: "declined" }
  | { kind: "timeout" }
  | { kind: "refund-pending" }
  | { kind: "gated" }
  | { kind: "ended" }
  | { kind: "error"; message: string };

/** The stay and cart a booking was made from, to rebuild it on /rooms or hold it again. */
export function cartFromBooking(b: Booking): { stay: CartStay; lines: CartLine[] } {
  const lines = b.rooms.map((r) => ({
    roomTypeId: r.roomTypeId,
    ratePlanId: r.ratePlanId,
    adults: r.adults,
    children: r.children,
  }));
  return {
    stay: {
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      adults: lines.reduce((s, l) => s + l.adults, 0),
      children: lines.reduce((s, l) => s + l.children, 0),
      promo: b.promoCode ?? undefined,
    },
    lines,
  };
}

export const PAY_COPY = {
  refundPending: "Payment received after your hold expired. It will be refunded. Book again?",
  declined: (left: string) =>
    `Your card was declined. Your rooms are still held for ${left}. Try again.`,
  timeout: "We didn't hear back from the bank.",
  ended: "This hold has ended. Your rooms were released.",
} as const;
