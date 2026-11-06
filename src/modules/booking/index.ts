/**
 * FROZEN CONTRACT (C1/C2). LOCKED AREA. Stub returns fixtures until B3/B5.
 * State machine and rules: docs/01-booking-core.md.
 */
import { z } from "zod";
import type { Err, Ok } from "@/lib/result";
import { quoteInputSchema, type Quote, type QuoteNight } from "@/modules/pricing";
import { bookingFixture, changedQuoteForHold } from "./fixtures";

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
  | Err<"INVALID_INPUT" | "SOLD_OUT" | "BLACKOUT" | "NO_RATE">
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

export const booking = {
  async acquireHold(input: AcquireHoldInput): Promise<AcquireHoldResult> {
    const parsed = acquireHoldInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    // Stub: the literal hash "stale" lets UI exercise PRICE_CHANGED.
    if (parsed.data.quoteHash === "stale") {
      return { ok: false, code: "PRICE_CHANGED", quote: changedQuoteForHold };
    }
    return { ok: true, booking: { ...bookingFixture, guestId: parsed.data.guestId } };
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
