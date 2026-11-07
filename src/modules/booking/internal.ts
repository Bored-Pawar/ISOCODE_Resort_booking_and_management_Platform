/**
 * INTERNAL expiry helpers. The scoped availability wrapper owns its transaction;
 * releaseExpiredHoldsInTx only uses the transaction supplied by its caller.
 * See docs/01-booking-core.md, "Contracts".
 */
import { getDb, type Tx } from "@/lib/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { eachNight } from "@/lib/dates";
import { adjustNights } from "@/modules/inventory/internal";
import { bookingEvents } from "@/db/schema";

export type ReleaseExpiredScope = {
  /** Limit to one room type. */
  roomTypeId?: string;
  /** Limit to holds whose stay overlaps [checkIn, checkOut). */
  checkIn?: string;
  checkOut?: string;
  /** Injected clock for tests; default now(). */
  now?: Date;
};

/** Booking owns the lazy-expiry write transaction; availability must always supply a date range. */
export async function releaseExpiredHoldsForAvailability(
  scope: Pick<ReleaseExpiredScope, "roomTypeId"> & { checkIn: string; checkOut: string },
): Promise<{ released: number }> {
  return getDb().transaction((tx) => releaseExpiredHoldsInTx(tx, scope));
}

/**
 * Moves HELD bookings past hold_expires_at to EXPIRED (FOR UPDATE SKIP LOCKED), writes a
 * booking_events row for each and releases their nights through inventory.adjustNights, all in the
 * caller's transaction. Idempotent: a booking leaves HELD once, so stock is released once.
 */
export async function releaseExpiredHoldsInTx(
  tx: Tx,
  scope: ReleaseExpiredScope,
): Promise<{ released: number }> {
  if (scope.roomTypeId && !z.uuid().safeParse(scope.roomTypeId).success) return { released: 0 };
  const roomFilter = scope.roomTypeId ? sql`AND room_type_id = ${scope.roomTypeId}::uuid` : sql``;
  const now = scope.now ? sql`${scope.now.toISOString()}::timestamptz` : sql`clock_timestamp()`;
  const expired = await tx.execute<{
    id: string;
    room_type_id: string;
    check_in: string;
    check_out: string;
    units: number;
  }>(sql`
    UPDATE bookings SET status = 'EXPIRED'
    WHERE id IN (
      SELECT id FROM bookings WHERE status = 'HELD' AND hold_expires_at <= ${now}
        ${roomFilter}
        AND (${scope.checkIn ?? null}::date IS NULL OR check_out > ${scope.checkIn ?? null}::date)
        AND (${scope.checkOut ?? null}::date IS NULL OR check_in < ${scope.checkOut ?? null}::date)
      ORDER BY id FOR UPDATE SKIP LOCKED
    ) AND status = 'HELD'
    RETURNING id, room_type_id, check_in::text, check_out::text, units
  `);
  // Aggregate the whole batch before writing: overlapping stays must not reverse lock order.
  const changes = new Map<string, { roomTypeId: string; date: string; units: number }>();
  for (const b of expired)
    for (const date of eachNight(b.check_in, b.check_out)) {
      const key = `${b.room_type_id}|${date}`;
      const entry = changes.get(key) ?? { roomTypeId: b.room_type_id, date, units: 0 };
      entry.units += b.units;
      changes.set(key, entry);
    }
  for (const key of [...changes.keys()].sort()) {
    const c = changes.get(key)!;
    await adjustNights(tx, {
      roomTypeId: c.roomTypeId,
      dates: [c.date],
      heldDelta: -c.units,
      soldDelta: 0,
    });
  }
  if (expired.length)
    await tx.insert(bookingEvents).values(
      expired.map((b) => ({
        bookingId: b.id,
        fromStatus: "HELD",
        toStatus: "EXPIRED",
        actor: "system:expiry",
        note: "Hold expired",
      })),
    );
  return { released: expired.length };
}
