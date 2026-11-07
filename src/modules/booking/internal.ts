/**
 * INTERNAL helper used by booking itself, the cron route and (through booking/index.ts)
 * inventory.availability for lazy expiry (R01). Signature only until B4.
 * See docs/01-booking-core.md, "Contracts".
 */
import type { Tx } from "@/lib/db";

export type ReleaseExpiredScope = {
  /** Limit to one room type. */
  roomTypeId?: string;
  /** Limit to holds whose stay overlaps [checkIn, checkOut). */
  checkIn?: string;
  checkOut?: string;
  /** Injected clock for tests; default now(). */
  now?: Date;
};

/**
 * Moves HELD bookings past hold_expires_at to EXPIRED (FOR UPDATE SKIP LOCKED), writes a
 * booking_events row for each and releases their nights through inventory.adjustNights, all in the
 * caller's transaction. Idempotent: a booking leaves HELD once, so stock is released once.
 */
export async function releaseExpiredHoldsInTx(
  tx: Tx,
  scope: ReleaseExpiredScope,
): Promise<{ released: number }> {
  void tx;
  void scope;
  throw new Error("booking.releaseExpiredHoldsInTx is not implemented (B4)");
}
