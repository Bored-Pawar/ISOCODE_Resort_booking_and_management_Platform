/**
 * FROZEN CONTRACT (C1/C2). LOCKED AREA. Persisted booking lifecycle and frozen snapshots.
 * State machine and rules: docs/01-booking-core.md.
 */
import { z } from "zod";
import type { Err, Ok } from "@/lib/result";
import { quoteInputSchema, type LineError, type Quote, type QuoteNight } from "@/modules/pricing";
import { confirmPayment as confirmPaymentImpl } from "./confirmation";
import { getDb } from "@/lib/db";
import { releaseExpiredHoldsInTx } from "./internal";
import { acquireHold as acquireHoldImpl } from "./hold";
import { cancelHeld as cancelHeldImpl } from "./cancel";
import {
  getForStaff as getForStaffImpl,
  listForStaff as listForStaffImpl,
  listRefundPending as listRefundPendingImpl,
} from "./staff";
import { isDateStr } from "@/lib/dates";
import { readBooking } from "./read";
import { bookings, payments } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

export type BookingStatus = "HELD" | "CONFIRMED" | "EXPIRED" | "CANCELLED";

/** One room line of a booking: the frozen line snapshot plus its nights. */
export type BookingRoom = {
  /** 1 to 4, in the cart order the guest priced. */
  lineNo: number;
  roomTypeId: string;
  ratePlanId: string;
  adults: number;
  children: number;
  subtotalPaise: number;
  discountPaise: number;
  gstPaise: number;
  totalPaise: number;
  nights: QuoteNight[];
};

export type Booking = {
  id: string;
  /** Guest facing reference, e.g. CA-7K3P9. */
  ref: string;
  guestId: string;
  checkIn: string;
  checkOut: string;
  status: BookingStatus;
  /** ISO timestamp, set while HELD. */
  holdExpiresAt: string | null;
  quoteHash: string;
  promoCode: string | null;
  /** Order price snapshot frozen at hold time = sum of rooms. Payment charges totalPaise only. */
  subtotalPaise: number;
  discountPaise: number;
  gstPaise: number;
  totalPaise: number;
  /** B10: 1 to 4 room lines ordered by lineNo. Every line shares checkIn and checkOut. */
  rooms: BookingRoom[];
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
  | Err<"INVALID_INPUT" | "BLACKOUT" | "PROMO_INVALID">
  /** B10: the room type that ran out, when known. All or nothing: no line was held. */
  | Err<"SOLD_OUT", { roomTypeId?: string }>
  /** B10: lineIndex is the 0-based position in stay.rooms of the line at fault. */
  | Err<"NO_RATE" | "OVER_OCCUPANCY", LineError>
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

const actorSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["guest", "reservations", "sales", "gm"]),
});

export const getBookingInputSchema = z.object({ ref: z.string().min(1) });
export type GetBookingInput = z.input<typeof getBookingInputSchema>;

export type GetBookingResult =
  Ok<{ booking: Booking }> | Err<"INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN">;

// ---- listForGuest (additive, read only) -------------------------------

/** guestId comes from the verified session only, never from client input (like acquireHold). */
export const listForGuestInputSchema = z.object({
  guestId: z.uuid(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type ListForGuestInput = z.input<typeof listForGuestInputSchema>;

/** Newest stay first. Every status; a HELD row past holdExpiresAt is not yet swept (UI says so). */
export type ListForGuestResult = Ok<{ bookings: Booking[] }> | Err<"INVALID_INPUT">;

// ---- cancelHeld (additive, S2 runbook contract addition 1) --------------

export const cancelHeldInputSchema = z.object({ bookingId: z.uuid() });
export type CancelHeldInput = z.input<typeof cancelHeldInputSchema>;

/**
 * Owner only. ok: this call moved HELD -> CANCELLED and released the stock. NOT_HELD: the booking
 * had already left HELD (expired, confirmed, cancelled); its current state, never a throw.
 */
export type CancelHeldResult =
  | Ok<{ booking: Booking }>
  | Err<"INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN">
  | Err<"NOT_HELD", { status: BookingStatus; booking: Booking }>;

// ---- staff reads (additive, read only; A5 and the dev outbox) ----------

/** Roles with booking authority. Sales has none in the current scope (runbook item 8). */
export const BOOKING_STAFF_ROLES = ["reservations", "gm"] as const;

const isoDate = z.string().refine(isDateStr, "Expected a YYYY-MM-DD date");

export const listForStaffInputSchema = z
  .object({
    status: z.enum(["HELD", "CONFIRMED", "EXPIRED", "CANCELLED"]).optional(),
    /** Inclusive check-in range. */
    checkInFrom: isoDate.optional(),
    checkInTo: isoDate.optional(),
    limit: z.number().int().min(1).max(200).default(50),
  })
  .refine((v) => !v.checkInFrom || !v.checkInTo || v.checkInFrom <= v.checkInTo, {
    path: ["checkInTo"],
    message: "checkInTo must not be before checkInFrom",
  });
export type ListForStaffInput = z.input<typeof listForStaffInputSchema>;
export type ParsedListForStaffInput = z.output<typeof listForStaffInputSchema>;

/** Newest created first. */
export type ListForStaffResult = Ok<{ bookings: Booking[] }> | Err<"INVALID_INPUT" | "FORBIDDEN">;

export type BookingEvent = {
  at: string;
  fromStatus: string | null;
  toStatus: string | null;
  actor: string;
  note: string | null;
};

export type StaffPayment = {
  id: string;
  bookingId: string;
  ref: string;
  provider: string;
  providerPaymentId: string;
  amountPaise: number;
  status: "SUCCESS" | "FAILED" | "REFUND_PENDING";
  createdAt: string;
};

export type GetForStaffResult =
  | Ok<{ booking: Booking; events: BookingEvent[]; payments: StaffPayment[] }>
  | Err<"INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN">;

export const listRefundPendingInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
});
export type ListRefundPendingResult =
  Ok<{ payments: StaffPayment[] }> | Err<"INVALID_INPUT" | "FORBIDDEN">;

function isBookingStaff(actor: BookingActor): boolean {
  return (
    actorSchema.safeParse(actor).success &&
    (BOOKING_STAFF_ROLES as readonly string[]).includes(actor.role)
  );
}

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

  /** Additive (contract addition 1): the owning guest abandons a hold. See cancel.ts. */
  async cancelHeld(input: CancelHeldInput, actor: BookingActor): Promise<CancelHeldResult> {
    const parsed = cancelHeldInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    if (!actorSchema.safeParse(actor).success) return { ok: false, code: "FORBIDDEN" };
    return cancelHeldImpl(parsed.data.bookingId.toLowerCase(), actor);
  },

  /** Additive staff read (A5): reservations or gm only. Never writes; no lazy expiry. */
  async listForStaff(input: ListForStaffInput, actor: BookingActor): Promise<ListForStaffResult> {
    if (!isBookingStaff(actor)) return { ok: false, code: "FORBIDDEN" };
    const parsed = listForStaffInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    return listForStaffImpl(parsed.data);
  },

  /** Additive staff read (A5): one booking with its event timeline and payments. */
  async getForStaff(input: GetBookingInput, actor: BookingActor): Promise<GetForStaffResult> {
    if (!isBookingStaff(actor)) return { ok: false, code: "FORBIDDEN" };
    const parsed = getBookingInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    return getForStaffImpl(parsed.data.ref);
  },

  /** Additive staff read (A5): payments recorded as REFUND_PENDING, newest first. */
  async listRefundPending(
    input: z.input<typeof listRefundPendingInputSchema>,
    actor: BookingActor,
  ): Promise<ListRefundPendingResult> {
    if (!isBookingStaff(actor)) return { ok: false, code: "FORBIDDEN" };
    const parsed = listRefundPendingInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    return listRefundPendingImpl(parsed.data.limit);
  },

  /**
   * Additive read (S2 review fix): ids of this guest's bookings with a payment recorded as
   * REFUND_PENDING (paid after the hold ended), so guest pages can say a refund is on its way.
   * guestId comes from the verified session only.
   */
  async refundPendingForGuest(input: {
    guestId: string;
  }): Promise<Ok<{ bookingIds: string[] }> | Err<"INVALID_INPUT">> {
    const parsed = z.object({ guestId: z.uuid() }).safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    const rows = await getDb()
      .selectDistinct({ id: payments.bookingId })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .where(
        and(
          eq(bookings.guestId, parsed.data.guestId.toLowerCase()),
          eq(payments.status, "REFUND_PENDING"),
        ),
      );
    return { ok: true, bookingIds: rows.map((r) => r.id) };
  },

  /** Additive read for "My bookings". Never writes; no lazy expiry. */
  async listForGuest(input: ListForGuestInput): Promise<ListForGuestResult> {
    const parsed = listForGuestInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    const guestId = parsed.data.guestId.toLowerCase();
    return getDb().transaction(async (tx) => {
      const rows = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(eq(bookings.guestId, guestId))
        .orderBy(desc(bookings.checkIn), desc(bookings.createdAt))
        .limit(parsed.data.limit);
      const list: Booking[] = [];
      for (const r of rows) {
        const b = await readBooking(tx, r.id);
        if (b) list.push(b);
      }
      return { ok: true, bookings: list } as const;
    });
  },

  async get(input: GetBookingInput, actor: BookingActor): Promise<GetBookingResult> {
    const parsed = getBookingInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    if (!actorSchema.safeParse(actor).success) return { ok: false, code: "FORBIDDEN" };
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
