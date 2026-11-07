/**
 * FROZEN CONTRACT (C1/C2). LOCKED AREA. Stub returns fixtures until B3/B5.
 * State machine and rules: docs/01-booking-core.md.
 */
import { z } from "zod";
import type { Err, Ok } from "@/lib/result";
import { pricing, quoteInputSchema, type Quote, type QuoteNight } from "@/modules/pricing";
import { bookingFixture } from "./fixtures";

export type BookingStatus = "HELD" | "CONFIRMED" | "EXPIRED" | "CANCELLED";

export type Booking = {
  id: string;
  /** Guest facing reference, e.g. CA-7K3P9. */
  ref: string;
  guestId: string;
  roomTypeId: string;
  ratePlanId: string;
  checkIn: string;
  checkOut: string;
  /** Always 1 in the MVP. */
  units: number;
  adults: number;
  children: number;
  status: BookingStatus;
  /** ISO timestamp, set while HELD. */
  holdExpiresAt: string | null;
  quoteHash: string;
  promoCode: string | null;
  /** Price snapshot frozen at hold time. Payment charges totalPaise only. */
  subtotalPaise: number;
  discountPaise: number;
  gstPaise: number;
  totalPaise: number;
  nights: QuoteNight[];
  createdAt: string;
  confirmedAt: string | null;
};

// ---- acquireHold -------------------------------------------------------

export const acquireHoldInputSchema = z.object({
  /** The stay the guest priced. */
  stay: quoteInputSchema,
  /** quoteHash the guest saw. Recomputed inside the transaction; mismatch => PRICE_CHANGED. */
  quoteHash: z.string().min(1),
  guestId: z.string().min(1),
});
export type AcquireHoldInput = z.input<typeof acquireHoldInputSchema>;

export type AcquireHoldResult =
  | Ok<{ booking: Booking }>
  /** PROMO_INVALID and OVER_OCCUPANCY come from the price recheck (pricing.quote) inside the hold. */
  | Err<"INVALID_INPUT" | "SOLD_OUT" | "BLACKOUT" | "NO_RATE" | "PROMO_INVALID" | "OVER_OCCUPANCY">
  /** No hold taken. UI shows "price updated" with the new quote. */
  | Err<"PRICE_CHANGED", { quote: Quote }>;

// ---- confirmPayment ----------------------------------------------------

export const confirmPaymentInputSchema = z.object({
  bookingId: z.string().min(1),
  provider: z.string().min(1),
  /** Unique per provider payment. A repeat is a no-op (duplicate webhook). */
  providerPaymentId: z.string().min(1),
  amountPaise: z.number().int().positive(),
});
export type ConfirmPaymentInput = z.input<typeof confirmPaymentInputSchema>;

export type ConfirmPaymentResult =
  | Ok<{
      /**
       * CONFIRMED: this call confirmed it. ALREADY_CONFIRMED: duplicate, no-op.
       * REFUND_PENDING: paid after the hold expired; booking stays EXPIRED.
       */
      outcome: "CONFIRMED" | "ALREADY_CONFIRMED" | "REFUND_PENDING";
      booking: Booking;
    }>
  | Err<"INVALID_INPUT" | "NOT_FOUND" | "AMOUNT_MISMATCH">;

// ---- get ---------------------------------------------------------------

export type BookingActor = { userId: string; role: "guest" | "reservations" | "sales" | "gm" };

export const getBookingInputSchema = z.object({ ref: z.string().min(1) });
export type GetBookingInput = z.input<typeof getBookingInputSchema>;

export type GetBookingResult =
  Ok<{ booking: Booking }> | Err<"INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN">;

// ---- releaseExpiredHolds (cron, lazy expiry) --------------------------

export type ReleaseExpiredHoldsResult = Ok<{ released: number }>;

export const booking = {
  /**
   * Opens its own transaction and releases expired holds. Used by the daily cron route and by
   * inventory.availability before it reads stock. Stub until B4. Additive to the C1 contract.
   */
  async releaseExpiredHolds(): Promise<ReleaseExpiredHoldsResult> {
    return { ok: true, released: 0 };
  },

  async acquireHold(input: AcquireHoldInput): Promise<AcquireHoldResult> {
    const parsed = acquireHoldInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    // Stub: recompute the quote for the requested stay. A different hash means the price moved.
    // guestId must come from the server session only, never from client input (see 01 Contract notes).
    const { stay, quoteHash, guestId } = parsed.data;
    const priced = await pricing.quote(stay);
    if (!priced.ok) {
      return { ok: false, code: priced.code };
    }
    const q = priced.quote;
    if (q.quoteHash !== quoteHash) return { ok: false, code: "PRICE_CHANGED", quote: q };
    return {
      ok: true,
      booking: {
        ...bookingFixture,
        guestId,
        roomTypeId: q.roomTypeId,
        ratePlanId: q.ratePlanId,
        checkIn: q.checkIn,
        checkOut: q.checkOut,
        adults: stay.adults,
        children: stay.children ?? 0,
        quoteHash: q.quoteHash,
        promoCode: q.promo?.code ?? null,
        subtotalPaise: q.subtotalPaise,
        discountPaise: q.discountPaise,
        gstPaise: q.gstPaise,
        totalPaise: q.totalPaise,
        nights: q.nights,
        holdExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      },
    };
  },

  async confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResult> {
    const parsed = confirmPaymentInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    if (parsed.data.amountPaise !== bookingFixture.totalPaise) {
      return { ok: false, code: "AMOUNT_MISMATCH" };
    }
    return {
      ok: true,
      outcome: "CONFIRMED",
      booking: {
        ...bookingFixture,
        status: "CONFIRMED",
        holdExpiresAt: null,
        confirmedAt: "2026-11-07T10:05:00.000Z",
      },
    };
  },

  async get(input: GetBookingInput, actor: BookingActor): Promise<GetBookingResult> {
    const parsed = getBookingInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    if (parsed.data.ref !== bookingFixture.ref) return { ok: false, code: "NOT_FOUND" };
    if (actor.role === "guest" && actor.userId !== bookingFixture.guestId) {
      return { ok: false, code: "FORBIDDEN" };
    }
    return { ok: true, booking: bookingFixture };
  },
};
