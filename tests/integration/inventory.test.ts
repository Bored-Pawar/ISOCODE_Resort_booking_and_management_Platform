import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import * as dbModule from "@/lib/db";
import * as t from "@/db/schema";
import { inventory } from "@/modules/inventory";
import { lockNights } from "@/modules/inventory/internal";
import { booking } from "@/modules/booking";
import { connect, ensureMigrated, testUrl } from "./helpers";
import { coreFixture, dates, testSlabs } from "./core-fixture";

const sql = connect();
const { db, client } = dbModule.createDb(testUrl(), { max: 5 });
let f: Awaited<ReturnType<typeof coreFixture>>;
let cleanSlabs: Awaited<ReturnType<typeof testSlabs>>;
beforeAll(async () => {
  await ensureMigrated(sql);
  cleanSlabs = await testSlabs(db);
});
beforeEach(async () => {
  vi.spyOn(dbModule, "getDb").mockReturnValue(db);
  f = await coreFixture(db);
});
afterEach(async () => {
  await f?.clean();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await cleanSlabs?.();
  await client.end();
  await sql.end();
});

describe("B2 database inventory", () => {
  it("reports the minimum website stock across every night", async () => {
    await db
      .update(t.inventory)
      .set({ allotment: 4, sold: 1, held: 1 })
      .where(eq(t.inventory.roomTypeId, f.room.id));
    const r = await inventory.availability(f.stay);
    expect(r).toEqual({
      ok: true,
      rooms: [{ roomTypeId: f.room.id, availableUnits: 2, soldOut: false, blackedOut: false }],
    });
    await db
      .update(t.inventory)
      .set({ allotment: 2 })
      .where(and(eq(t.inventory.roomTypeId, f.room.id), eq(t.inventory.date, dates[1])));
    const sold = await inventory.availability(f.stay);
    expect(sold.ok && sold.rooms[0].soldOut).toBe(true);
    expect(await db.transaction((tx) => lockNights(tx, { ...f.stay, units: 1 }))).toEqual({
      ok: false,
      code: "SOLD_OUT",
    });
  });
  it("treats missing nights as unavailable and returns no fabricated room for an unknown ID", async () => {
    await db
      .delete(t.inventory)
      .where(and(eq(t.inventory.roomTypeId, f.room.id), eq(t.inventory.date, dates[1])));
    const r = await inventory.availability(f.stay);
    expect(r.ok && r.rooms[0].availableUnits).toBe(0);
    expect(await db.transaction((tx) => lockNights(tx, { ...f.stay, units: 1 }))).toEqual({
      ok: false,
      code: "SOLD_OUT",
    });
    expect(await inventory.availability({ ...f.stay, roomTypeId: "unknown" })).toEqual({
      ok: true,
      rooms: [],
    });
  });
  it.each([false, true])(
    "respects inclusive room/global blackouts (global=%s), excluding checkout",
    async (global) => {
      const [blackout] = await db
        .insert(t.blackoutDates)
        .values({
          roomTypeId: global ? null : f.room.id,
          startDate: f.stay.checkOut,
          endDate: f.stay.checkOut,
        })
        .returning();
      try {
        const open = await inventory.availability(f.stay);
        expect(open.ok && open.rooms[0].blackedOut).toBe(false);
        await db
          .update(t.blackoutDates)
          .set({ startDate: dates[1] })
          .where(eq(t.blackoutDates.id, blackout.id));
        const closed = await inventory.availability(f.stay);
        expect(closed.ok && closed.rooms[0]).toMatchObject({ blackedOut: true, soldOut: true });
        expect(await db.transaction((tx) => lockNights(tx, { ...f.stay, units: 1 }))).toEqual({
          ok: false,
          code: "BLACKOUT",
        });
      } finally {
        await db.delete(t.blackoutDates).where(eq(t.blackoutDates.id, blackout.id));
      }
    },
  );
  it("returns successful ordered nightly locks without taking inventory", async () => {
    const r = await db.transaction((tx) => lockNights(tx, { ...f.stay, units: 1 }));
    expect(r.ok && r.nights.map((n) => n.date)).toEqual(dates);
    const stock = await db.select().from(t.inventory).where(eq(t.inventory.roomTypeId, f.room.id));
    expect(stock.every((n) => n.held === 0)).toBe(true);
  });
  async function expiredHold() {
    const [b] = await db
      .insert(t.bookings)
      .values({
        ref: `TEST-${f.room.slug}`,
        guestId: f.guest.id,
        ...f.stay,
        status: "HELD",
        quoteHash: "test",
        holdExpiresAt: new Date(0),
        subtotalPaise: 1,
        gstPaise: 0,
        totalPaise: 1,
      })
      .returning();
    await db.update(t.inventory).set({ held: 1 }).where(eq(t.inventory.roomTypeId, f.room.id));
    return b;
  }
  it("releases an overdue hold before availability and records expiry exactly once", async () => {
    const b = await expiredHold();
    const r = await inventory.availability(f.stay);
    expect(r.ok && r.rooms[0].availableUnits).toBe(1);
    expect(await booking.releaseExpiredHolds()).toEqual({ ok: true, released: 0 });
    const [expired] = await db.select().from(t.bookings).where(eq(t.bookings.id, b.id));
    expect(expired.status).toBe("EXPIRED");
    const events = await db
      .select()
      .from(t.bookingEvents)
      .where(eq(t.bookingEvents.bookingId, b.id));
    expect(events).toHaveLength(1);
  });
  it("concurrent expiry callers release stock and write the transition once (mandatory test 3)", async () => {
    const b = await expiredHold();
    const results = await Promise.all([
      booking.releaseExpiredHolds(),
      booking.releaseExpiredHolds(),
    ]);
    expect(results.reduce((sum, r) => sum + r.released, 0)).toBe(1);
    const stock = await db.select().from(t.inventory).where(eq(t.inventory.roomTypeId, f.room.id));
    expect(stock.map((n) => n.held)).toEqual([0, 0]);
    const events = await db
      .select()
      .from(t.bookingEvents)
      .where(eq(t.bookingEvents.bookingId, b.id));
    expect(events).toHaveLength(1);
  });
});
