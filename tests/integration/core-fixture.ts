import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import type { Db } from "@/lib/db";
import { eachNight } from "@/lib/dates";
import type { QuoteInput, QuoteRoomInput } from "@/modules/pricing";

export const checkIn = "2099-11-14";
export const checkOut = "2099-11-16";
export const dates = eachNight(checkIn, checkOut);

/** A cart for the shared test dates. */
export function cart(rooms: QuoteRoomInput[], extra: Partial<Omit<QuoteInput, "rooms">> = {}) {
  return { checkIn, checkOut, ...extra, rooms } satisfies QuoteInput;
}

/** Every test owns its rows. No truncation, development URLs or fixed IDs. */
export async function coreFixture(db: Db, rates = [750000, 750001]) {
  const tag = randomUUID();
  const [room] = await db
    .insert(t.roomTypes)
    .values({
      slug: tag,
      name: "Test room",
      description: "test",
      totalUnits: 10,
      maxAdults: 2,
      maxChildren: 1,
      maxOccupancy: 3,
    })
    .returning();
  const [guest] = await db
    .insert(t.users)
    .values({ email: `${tag}@test.example`, name: "Test", passwordHash: "unused", role: "guest" })
    .returning();
  const [plan] = await db
    .insert(t.ratePlans)
    .values({ roomTypeId: room.id, code: "EP", name: "Test", inclusions: "none" })
    .returning();
  await db.insert(t.dailyRates).values(
    dates.map((date, i) => ({
      roomTypeId: room.id,
      ratePlanId: plan.id,
      date,
      pricePaise: rates[i],
    })),
  );
  await db
    .insert(t.inventory)
    .values(dates.map((date) => ({ roomTypeId: room.id, date, allotment: 1 })));
  const promoIds: string[] = [];
  /** One room line of this fixture's type: 2 adults, no children. */
  const line = (over: Partial<QuoteRoomInput> = {}) => ({
    roomTypeId: room.id,
    ratePlanId: plan.id,
    adults: 2,
    children: 0,
    ...over,
  });
  return {
    room,
    guest,
    plan,
    line,
    /** The 1-line cart every single-room test uses. */
    stay: cart([line()]),
    /** The 1-line cart with its only line changed. */
    stayWith(over: Partial<QuoteRoomInput>) {
      return cart([line(over)]);
    },
    async promo(overrides: Partial<typeof t.promoCodes.$inferInsert> = {}) {
      const [p] = await db
        .insert(t.promoCodes)
        .values({
          code: tag.slice(0, 8).toUpperCase(),
          kind: "pct",
          value: 10,
          validFrom: checkIn,
          validTo: dates[dates.length - 1],
          minNights: 2,
          maxUses: 1,
          ...overrides,
        })
        .returning();
      promoIds.push(p.id);
      return p;
    },
    async clean() {
      const bookings = await db.execute<{ id: string }>(
        sql`SELECT DISTINCT booking_id AS id FROM booking_rooms WHERE room_type_id = ${room.id}::uuid`,
      );
      if (bookings.length) {
        const ids = bookings.map((b) => b.id);
        await db.delete(t.payments).where(inArray(t.payments.bookingId, ids));
        await db.delete(t.bookings).where(inArray(t.bookings.id, ids));
      }
      await db.delete(t.roomTypes).where(eq(t.roomTypes.id, room.id));
      await db.delete(t.users).where(eq(t.users.id, guest.id));
      if (promoIds.length) await db.delete(t.promoCodes).where(inArray(t.promoCodes.id, promoIds));
    },
  };
}

/** Bookings with at least one line of the given room type. */
export async function bookingsOfType(db: Db, roomTypeId: string) {
  return db.execute<{ id: string; status: string }>(sql`
    SELECT b.id, b.status FROM bookings b
    WHERE EXISTS (SELECT 1 FROM booking_rooms r WHERE r.booking_id = b.id
      AND r.room_type_id = ${roomTypeId}::uuid)
  `);
}

/**
 * B10 reconciliation: per (room type, date), held and sold equal the number of booking_rooms
 * lines of that type on HELD and CONFIRMED bookings covering the date.
 */
export async function reconcileTypes(db: Db, roomTypeIds: string[]) {
  const ids = sql`ARRAY[${sql.join(
    roomTypeIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]`;
  return db.execute<{ room_type_id: string; date: string }>(sql`
    SELECT i.room_type_id, i.date::text FROM inventory i WHERE i.room_type_id = ANY(${ids}) AND (
      i.held <> (SELECT count(*) FROM booking_rooms r JOIN bookings b ON b.id = r.booking_id
        WHERE r.room_type_id = i.room_type_id AND b.status = 'HELD'
          AND b.check_in <= i.date AND b.check_out > i.date)
      OR i.sold <> (SELECT count(*) FROM booking_rooms r JOIN bookings b ON b.id = r.booking_id
        WHERE r.room_type_id = i.room_type_id AND b.status = 'CONFIRMED'
          AND b.check_in <= i.date AND b.check_out > i.date))
  `);
}

export async function testSlabs(db: Db) {
  const rows = await db
    .insert(t.taxSlabs)
    .values([
      { minPaise: 0, maxPaise: 750000, gstBp: 500, effectiveFrom: "2099-01-01" },
      { minPaise: 750001, maxPaise: null, gstBp: 1800, effectiveFrom: "2099-01-01" },
    ])
    .returning();
  return () =>
    db.delete(t.taxSlabs).where(
      inArray(
        t.taxSlabs.id,
        rows.map((s) => s.id),
      ),
    );
}
