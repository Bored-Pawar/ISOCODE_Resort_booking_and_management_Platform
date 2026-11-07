/**
 * INTERNAL, transaction-aware inventory helpers for the booking module only (R01).
 * Not exported from index.ts and never imported by UI. Signatures only until B2/B3.
 * See docs/01-booking-core.md, "Contracts".
 */
import type { Tx } from "@/lib/db";
import type { Err, Ok } from "@/lib/result";

export type LockedNight = {
  date: string;
  allotment: number;
  sold: number;
  held: number;
  blackedOut: boolean;
};

export type LockNightsInput = {
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  /** MVP: always 1. */
  units: number;
};

/** One entry per night, in date order. */
export type LockNightsResult = Ok<{ nights: LockedNight[] }> | Err<"SOLD_OUT" | "BLACKOUT">;

/**
 * SELECT ... FOR UPDATE on the inventory rows for [checkIn, checkOut), ordered by date ascending.
 * Returns SOLD_OUT if a night has no row or allotment - sold - held < units, BLACKOUT if blacked out.
 * Takes no stock itself. Locks are held until the caller's transaction ends.
 */
export async function lockNights(tx: Tx, input: LockNightsInput): Promise<LockNightsResult> {
  void tx;
  void input;
  throw new Error("inventory.lockNights is not implemented (B3)");
}

export type AdjustNightsInput = {
  roomTypeId: string;
  /** Applied in ascending date order. */
  dates: string[];
  /** Added to inventory.held on every date (negative to release). */
  heldDelta: number;
  /** Added to inventory.sold on every date (negative on staff cancel). */
  soldDelta: number;
};

/**
 * Applies the deltas with one UPDATE per date, in ascending order. The table CHECKs
 * (including sold + held <= allotment) are the last line of defence: a violation throws, which
 * rolls back the caller's transaction. Call lockNights first.
 */
export async function adjustNights(tx: Tx, input: AdjustNightsInput): Promise<void> {
  void tx;
  void input;
  throw new Error("inventory.adjustNights is not implemented (B3)");
}
