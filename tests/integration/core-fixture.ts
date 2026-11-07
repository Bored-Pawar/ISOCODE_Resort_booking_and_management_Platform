import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import * as t from "@/db/schema";
import type { Db } from "@/lib/db";
import { eachNight } from "@/lib/dates";

export const checkIn = "2099-11-14";
export const checkOut = "2099-11-16";
export const dates = eachNight(checkIn, checkOut);

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
  return {
    room,
    guest,
    plan,
    stay: { roomTypeId: room.id, ratePlanId: plan.id, checkIn, checkOut, adults: 2, children: 0 },
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
      const bookings = await db
        .select({ id: t.bookings.id })
        .from(t.bookings)
        .where(eq(t.bookings.roomTypeId, room.id));
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
