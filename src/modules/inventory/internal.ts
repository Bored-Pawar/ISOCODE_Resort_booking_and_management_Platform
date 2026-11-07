/**
 * INTERNAL, transaction-aware inventory helpers for the booking module only (R01).
 * Not exported from index.ts and never imported by UI. Helpers never commit.
 * See docs/01-booking-core.md, "Contracts".
 */
import type { Tx } from "@/lib/db";
import type { Err, Ok } from "@/lib/result";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { nightsBetween } from "@/lib/dates";

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
  if (!z.uuid().safeParse(input.roomTypeId).success) return { ok: false, code: "SOLD_OUT" };
  const rows = await tx.execute<{
    date: string;
    allotment: number;
    sold: number;
    held: number;
  }>(sql`
    SELECT date::text, allotment, sold, held FROM inventory
    WHERE room_type_id = ${input.roomTypeId}::uuid
      AND date >= ${input.checkIn}::date AND date < ${input.checkOut}::date
    ORDER BY date FOR UPDATE
  `);
  const blackouts = await tx.execute<{ start_date: string; end_date: string }>(sql`
    SELECT start_date::text, end_date::text FROM blackout_dates
    WHERE (room_type_id IS NULL OR room_type_id = ${input.roomTypeId}::uuid)
      AND start_date < ${input.checkOut}::date AND end_date >= ${input.checkIn}::date
  `);
  if (blackouts.length) return { ok: false, code: "BLACKOUT" };
  if (
    rows.length !== nightsBetween(input.checkIn, input.checkOut) ||
    rows.some((r) => r.allotment - r.sold - r.held < input.units)
  ) {
    return { ok: false, code: "SOLD_OUT" };
  }
  return { ok: true, nights: rows.map((r) => ({ ...r, blackedOut: false })) };
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
  for (const date of [...new Set(input.dates)].sort()) {
    const rows = await tx.execute(sql`
      UPDATE inventory SET held = held + ${input.heldDelta}, sold = sold + ${input.soldDelta},
        updated_at = clock_timestamp()
      WHERE room_type_id = ${input.roomTypeId}::uuid AND date = ${date}::date RETURNING date
    `);
    if (rows.length !== 1)
      throw new Error(`Missing inventory row for ${input.roomTypeId}: ${date}`);
  }
}
