/**
 * FROZEN CONTRACT (C1/C2). LOCKED AREA. Persisted booking lifecycle and frozen snapshots.
 * State machine and rules: docs/01-booking-core.md.
 */
import { z } from "zod";
import type { Err, Ok } from "@/lib/result";
import { quoteInputSchema, type Quote, type QuoteNight } from "@/modules/pricing";
import { confirmPayment as confirmPaymentImpl } from "./confirmation";
import { getDb } from "@/lib/db";
import { releaseExpiredHoldsInTx } from "./internal";
import { acquireHold as acquireHoldImpl } from "./hold";
import { readBooking } from "./read";
import { bookings } from "@/db/schema";
import { eq } from "drizzle-orm";

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
   * Site-wide sweep for cron/maintenance. Availability uses a separate scoped internal wrapper.
   * Opens its own transaction. Additive to the C1 contract.
   */
  async releaseExpiredHolds(): Promise<ReleaseExpiredHoldsResult> {
    const result = await getDb().transaction((tx) => releaseExpiredHoldsInTx(tx, {}));
    return { ok: true, ...result };
  },

  async acquireHold(input: AcquireHoldInput): Promise<AcquireHoldResult> {
    const parsed = acquireHoldInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    return acquireHoldImpl(parsed.data);
  },

  async confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResult> {
    const parsed = confirmPaymentInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    return confirmPaymentImpl(parsed.data);
  },

  async get(input: GetBookingInput, actor: BookingActor): Promise<GetBookingResult> {
    const parsed = getBookingInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    if (
      !z
        .object({
          userId: z.string().min(1),
          role: z.enum(["guest", "reservations", "sales", "gm"]),
        })
        .safeParse(actor).success
    )
      return { ok: false, code: "FORBIDDEN" };
    return getDb().transaction(async (tx) => {
      const [row] = await tx
        .select({ id: bookings.id, guestId: bookings.guestId })
        .from(bookings)
        .where(eq(bookings.ref, parsed.data.ref));
      if (!row) return { ok: false, code: "NOT_FOUND" } as const;
      if (actor.role === "guest" && actor.userId.toLowerCase() !== row.guestId)
        return { ok: false, code: "FORBIDDEN" } as const;
      return { ok: true, booking: (await readBooking(tx, row.id))! } as const;
    });
  },
};
