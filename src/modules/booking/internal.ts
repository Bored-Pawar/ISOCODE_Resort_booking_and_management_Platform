/**
 * INTERNAL expiry helpers. The scoped availability wrapper owns its transaction;
 * releaseExpiredHoldsInTx only uses the transaction supplied by its caller.
 * See docs/01-booking-core.md, "Contracts".
 */
import { getDb, type Tx } from "@/lib/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { eachNight } from "@/lib/dates";
import { adjustNights, lockInventoryRows, type NightChange } from "@/modules/inventory/internal";
import { bookingEvents } from "@/db/schema";

export type ReleaseExpiredScope = {
  /** Payment confirmation limits expiry to its own booking, before any inventory locks. */
  bookingId?: string;
  /** B10: limit to holds with at least one line of these room types. */
  roomTypeIds?: string[];
  /** Limit to holds whose stay overlaps [checkIn, checkOut). */
  checkIn?: string;
  checkOut?: string;
  /** Injected clock for tests; default now(). */
  now?: Date;
};

const uuid = z.uuid();

/** Booking owns the lazy-expiry write transaction; availability must always supply a date range. */
export async function releaseExpiredHoldsForAvailability(scope: {
  roomTypeId?: string;
  checkIn: string;
  checkOut: string;
}): Promise<{ released: number }> {
  const { roomTypeId, checkIn, checkOut } = scope;
  return getDb().transaction((tx) =>
    releaseExpiredHoldsInTx(tx, {
      roomTypeIds: roomTypeId ? [roomTypeId] : undefined,
      checkIn,
      checkOut,
    }),
  );
}

/** Lines per (booking, room type): the inventory units a booking holds of each type. */
async function linesByType(tx: Tx, bookingIds: string[]) {
  const ids = sql`ARRAY[${sql.join(
    bookingIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]`;
  return tx.execute<{ booking_id: string; room_type_id: string; units: number }>(sql`
    SELECT booking_id, room_type_id, count(*)::int AS units FROM booking_rooms
    WHERE booking_id = ANY(${ids}) GROUP BY booking_id, room_type_id
  `);
}

/**
 * Inventory changes for a set of bookings with the same dates per booking: per room type, the
 * number of its lines on every night (B10 rule 5). Used by expiry and confirmation.
 */
export async function bookingNightChanges(
  tx: Tx,
  bookings: { id: string; checkIn: string; checkOut: string }[],
  delta: (units: number) => Pick<NightChange, "heldDelta" | "soldDelta">,
): Promise<NightChange[]> {
  if (!bookings.length) return [];
  const byId = new Map(bookings.map((b) => [b.id, b]));
  return (await linesByType(tx, [...byId.keys()])).map((l) => {
    const b = byId.get(l.booking_id)!;
    return {
      roomTypeId: l.room_type_id,
      dates: eachNight(b.checkIn, b.checkOut),
      ...delta(l.units),
    };
  });
}

/**
 * Moves HELD bookings past hold_expires_at to EXPIRED (FOR UPDATE SKIP LOCKED), writes a
 * booking_events row for each and releases their nights through inventory.adjustNights, all in the
 * caller's transaction. Idempotent: a booking leaves HELD once, so stock is released once.
 * Known limit (B10 minor fix 5): one statement over every matching hold, not batched.
 */
export async function releaseExpiredHoldsInTx(
  tx: Tx,
  scope: ReleaseExpiredScope,
): Promise<{ released: number }> {
  const roomTypeIds = scope.roomTypeIds?.map((id) => id.toLowerCase());
  if (roomTypeIds && (!roomTypeIds.length || roomTypeIds.some((id) => !uuid.safeParse(id).success)))
    return { released: 0 };
  if (scope.bookingId && !uuid.safeParse(scope.bookingId).success) return { released: 0 };
  const bookingFilter = scope.bookingId ? sql`AND b.id = ${scope.bookingId}::uuid` : sql``;
  const roomFilter = roomTypeIds
    ? sql`AND EXISTS (SELECT 1 FROM booking_rooms r WHERE r.booking_id = b.id
        AND r.room_type_id = ANY(ARRAY[${sql.join(
          roomTypeIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}]))`
    : sql``;
  const now = scope.now ? sql`${scope.now.toISOString()}::timestamptz` : sql`clock_timestamp()`;
  const expired = await tx.execute<{ id: string; check_in: string; check_out: string }>(sql`
    UPDATE bookings SET status = 'EXPIRED'
    WHERE id IN (
      SELECT b.id FROM bookings b WHERE b.status = 'HELD' AND b.hold_expires_at <= ${now}
        ${bookingFilter}
        ${roomFilter}
        AND (${scope.checkIn ?? null}::date IS NULL OR b.check_out > ${scope.checkIn ?? null}::date)
        AND (${scope.checkOut ?? null}::date IS NULL OR b.check_in < ${scope.checkOut ?? null}::date)
      ORDER BY b.id FOR UPDATE OF b SKIP LOCKED
    ) AND status = 'HELD'
    RETURNING id, check_in::text, check_out::text
  `);
  if (!expired.length) return { released: 0 };
  const changes = await bookingNightChanges(
    tx,
    expired.map((b) => ({ id: b.id, checkIn: b.check_in, checkOut: b.check_out })),
    (units) => ({ heldDelta: -units, soldDelta: 0 }),
  );
  // A released stay can extend beyond the new request, or cover other types. Lock the union of
  // released and requested rows up front in one ordered statement, so the later lockNights call
  // cannot acquire an earlier (type, date) after this release acquired a later one.
  const locks = changes.flatMap((c) => c.dates.map((date) => ({ roomTypeId: c.roomTypeId, date })));
  if (roomTypeIds && scope.checkIn && scope.checkOut) {
    const requested = eachNight(scope.checkIn, scope.checkOut);
    for (const roomTypeId of roomTypeIds)
      locks.push(...requested.map((date) => ({ roomTypeId, date })));
  }
  await lockInventoryRows(tx, locks);
  await adjustNights(tx, { changes });
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
