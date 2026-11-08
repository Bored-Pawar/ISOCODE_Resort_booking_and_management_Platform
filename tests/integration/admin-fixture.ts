import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import type { Db } from "@/lib/db";
import { addDays, eachNight, todayIST } from "@/lib/dates";
import type { AdminActor } from "@/modules/admin";

/**
 * Admin services only accept dates inside today .. today + 179 (IST), so admin tests use near-term
 * dates on a room type of their own. Every row is owned by the fixture and removed by clean().
 */
export const START = addDays(todayIST(), 20);
/** 14 nights starting 20 days out. */
export const DAYS14 = eachNight(START, addDays(START, 14));

export async function adminFixture(db: Db, opts: { allotment?: number; totalUnits?: number } = {}) {
  const tag = randomUUID();
  const [room] = await db
    .insert(t.roomTypes)
    .values({
      slug: tag,
      name: "Admin test room",
      description: "test",
      totalUnits: opts.totalUnits ?? 8,
      maxAdults: 2,
      maxChildren: 1,
      maxOccupancy: 3,
    })
    .returning();
  const plans = await db
    .insert(t.ratePlans)
    .values(
      (["EP", "CP"] as const).map((code) => ({
        roomTypeId: room.id,
        code,
        name: code,
        inclusions: "none",
      })),
    )
    .returning();
  const [ep, cp] = [plans.find((p) => p.code === "EP")!, plans.find((p) => p.code === "CP")!];
  await db.insert(t.dailyRates).values(
    plans.flatMap((p) =>
      DAYS14.map((date) => ({
        roomTypeId: room.id,
        ratePlanId: p.id,
        date,
        pricePaise: 500000,
      })),
    ),
  );
  await db
    .insert(t.inventory)
    .values(DAYS14.map((date) => ({ roomTypeId: room.id, date, allotment: opts.allotment ?? 4 })));
  const users = await db
    .insert(t.users)
    .values(
      (["reservations", "sales", "gm", "guest"] as const).map((role) => ({
        email: `${role}-${tag}@test.example`,
        name: role,
        passwordHash: "unused",
        role,
      })),
    )
    .returning();
  const actor = (role: AdminActor["role"]): AdminActor => ({
    userId: users.find((u) => u.role === role)!.id,
    role,
  });
  const guests: string[] = [];
  const promoIds: string[] = [];
  const blackoutIds: string[] = [];
  // Slabs effective from START so quotes on these dates price (same values as the seed).
  const slabs = await db
    .insert(t.taxSlabs)
    .values([
      { minPaise: 0, maxPaise: 750000, gstBp: 500, effectiveFrom: START },
      { minPaise: 750001, maxPaise: null, gstBp: 1800, effectiveFrom: START },
    ])
    .returning();

  return {
    room,
    ep,
    cp,
    actor,
    reservations: actor("reservations"),
    sales: actor("sales"),
    gm: actor("gm"),
    guest: actor("guest"),
    async newGuest() {
      const [g] = await db
        .insert(t.users)
        .values({
          email: `${randomUUID()}@test.example`,
          name: "G",
          passwordHash: "unused",
          role: "guest",
        })
        .returning();
      guests.push(g.id);
      return g.id;
    },
    trackPromo(id: string) {
      promoIds.push(id);
    },
    trackBlackouts(ids: string[]) {
      blackoutIds.push(...ids);
    },
    async inventoryRows() {
      return db
        .select()
        .from(t.inventory)
        .where(eq(t.inventory.roomTypeId, room.id))
        .orderBy(t.inventory.date);
    },
    async rates() {
      return db
        .select()
        .from(t.dailyRates)
        .where(eq(t.dailyRates.roomTypeId, room.id))
        .orderBy(t.dailyRates.ratePlanId, t.dailyRates.date);
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
      if (blackoutIds.length)
        await db.delete(t.blackoutDates).where(inArray(t.blackoutDates.id, blackoutIds));
      await db.delete(t.blackoutDates).where(eq(t.blackoutDates.roomTypeId, room.id));
      await db.delete(t.roomTypes).where(eq(t.roomTypes.id, room.id));
      if (promoIds.length) await db.delete(t.promoCodes).where(inArray(t.promoCodes.id, promoIds));
      await db.delete(t.dailyRates).where(
        inArray(
          t.dailyRates.updatedBy,
          users.map((u) => u.id),
        ),
      );
      await db.delete(t.users).where(inArray(t.users.id, [...users.map((u) => u.id), ...guests]));
      await db.delete(t.taxSlabs).where(
        inArray(
          t.taxSlabs.id,
          slabs.map((s) => s.id),
        ),
      );
    },
  };
}
