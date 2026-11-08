import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, and, inArray } from "drizzle-orm";
import * as dbModule from "@/lib/db";
import * as t from "@/db/schema";
import { inventory } from "@/modules/inventory";
import { lockNights } from "@/modules/inventory/internal";
import { booking } from "@/modules/booking";
import { releaseExpiredHoldsInTx } from "@/modules/booking/internal";
import { eachNight } from "@/lib/dates";
import { connect, ensureMigrated, testUrl } from "./helpers";
import { bookingsOfType, coreFixture, dates, testSlabs } from "./core-fixture";

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
/** Availability for this fixture's room over the test dates (availability takes one room). */
const avail = () => ({ roomTypeId: f.room.id, checkIn: f.stay.checkIn, checkOut: f.stay.checkOut });
/** Scoped expiry for this fixture's room over the test dates. */
const scope = () => ({
  roomTypeIds: [f.room.id],
  checkIn: f.stay.checkIn,
  checkOut: f.stay.checkOut,
});
/** One unit of this fixture's room over the test dates. */
const lock = () => ({
  checkIn: f.stay.checkIn,
  checkOut: f.stay.checkOut,
  demand: [{ roomTypeId: f.room.id, units: 1 }],
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
    const r = await inventory.availability(avail());
    expect(r).toEqual({
      ok: true,
      rooms: [{ roomTypeId: f.room.id, availableUnits: 2, soldOut: false, blackedOut: false }],
    });
    await db
      .update(t.inventory)
      .set({ allotment: 2 })
      .where(and(eq(t.inventory.roomTypeId, f.room.id), eq(t.inventory.date, dates[1])));
    const sold = await inventory.availability(avail());
    expect(sold.ok && sold.rooms[0].soldOut).toBe(true);
    expect(await db.transaction((tx) => lockNights(tx, lock()))).toEqual({
      ok: false,
      code: "SOLD_OUT",
      roomTypeId: f.room.id,
    });
  });
  it("treats missing nights as unavailable and returns no fabricated room for an unknown ID", async () => {
    await db
      .delete(t.inventory)
      .where(and(eq(t.inventory.roomTypeId, f.room.id), eq(t.inventory.date, dates[1])));
    const r = await inventory.availability(avail());
    expect(r.ok && r.rooms[0].availableUnits).toBe(0);
    expect(await db.transaction((tx) => lockNights(tx, lock()))).toEqual({
      ok: false,
      code: "SOLD_OUT",
      roomTypeId: f.room.id,
    });
    expect(await inventory.availability({ ...avail(), roomTypeId: "unknown" })).toEqual({
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
        const open = await inventory.availability(avail());
        expect(open.ok && open.rooms[0].blackedOut).toBe(false);
        await db
          .update(t.blackoutDates)
          .set({ startDate: dates[1] })
          .where(eq(t.blackoutDates.id, blackout.id));
        const closed = await inventory.availability(avail());
        expect(closed.ok && closed.rooms[0]).toMatchObject({ blackedOut: true, soldOut: true });
        expect(await db.transaction((tx) => lockNights(tx, lock()))).toEqual(
          global
            ? { ok: false, code: "BLACKOUT" }
            : { ok: false, code: "BLACKOUT", roomTypeId: f.room.id },
        );
      } finally {
        await db.delete(t.blackoutDates).where(eq(t.blackoutDates.id, blackout.id));
      }
    },
  );
  it("returns successful ordered nightly locks without taking inventory", async () => {
    const r = await db.transaction((tx) => lockNights(tx, lock()));
    expect(r.ok && r.nights[f.room.id].map((n) => n.date)).toEqual(dates);
    const stock = await db.select().from(t.inventory).where(eq(t.inventory.roomTypeId, f.room.id));
    expect(stock.every((n) => n.held === 0)).toBe(true);
  });
  async function expiredHold(
    fixture = f,
    overrides: Partial<
      Pick<typeof t.bookings.$inferInsert, "checkIn" | "checkOut" | "holdExpiresAt">
    > = {},
  ) {
    const [b] = await db
      .insert(t.bookings)
      .values({
        ref: `TEST-${randomUUID()}`,
        guestId: fixture.guest.id,
        checkIn: fixture.stay.checkIn,
        checkOut: fixture.stay.checkOut,
        status: "HELD",
        quoteHash: "test",
        holdExpiresAt: new Date(0),
        subtotalPaise: 1,
        gstPaise: 0,
        totalPaise: 1,
        ...overrides,
      })
      .returning();
    await db.insert(t.bookingRooms).values({
      bookingId: b.id,
      lineNo: 1,
      roomTypeId: fixture.room.id,
      ratePlanId: fixture.plan.id,
      adults: 2,
      subtotalPaise: 1,
      gstPaise: 0,
      totalPaise: 1,
    });
    const nights = eachNight(b.checkIn, b.checkOut);
    await db
      .insert(t.inventory)
      .values(nights.map((date) => ({ roomTypeId: fixture.room.id, date, allotment: 1 })))
      .onConflictDoNothing();
    await db
      .update(t.inventory)
      .set({ held: 1 })
      .where(and(eq(t.inventory.roomTypeId, fixture.room.id), inArray(t.inventory.date, nights)));
    return b;
  }
  it("releases an overdue hold before availability and records expiry exactly once", async () => {
    const b = await expiredHold();
    const r = await inventory.availability(avail());
    expect(r.ok && r.rooms[0].availableUnits).toBe(1);
    expect(await db.transaction((tx) => releaseExpiredHoldsInTx(tx, scope()))).toEqual({
      released: 0,
    });
    const [expired] = await db.select().from(t.bookings).where(eq(t.bookings.id, b.id));
    expect(expired.status).toBe("EXPIRED");
    const events = await db
      .select()
      .from(t.bookingEvents)
      .where(eq(t.bookingEvents.bookingId, b.id));
    expect(events).toHaveLength(1);
  });
  it("concurrent expiry callers release stock and write the transition once (mandatory test 3)", async () => {
    // Global maintenance is intentionally broader than this fixture; clear older seed holds first.
    await booking.releaseExpiredHolds();
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

  it("scoped expiry releases one room/range and excludes stays ending at check-in or starting at checkout", async () => {
    const other = await coreFixture(db);
    try {
      const inside = await expiredHold();
      const before = await expiredHold(f, { checkIn: "2099-11-12", checkOut: f.stay.checkIn });
      const after = await expiredHold(f, { checkIn: f.stay.checkOut, checkOut: "2099-11-18" });
      const otherRoom = await expiredHold(other);
      expect(await db.transaction((tx) => releaseExpiredHoldsInTx(tx, scope()))).toEqual({
        released: 1,
      });
      const rows = await db
        .select()
        .from(t.bookings)
        .where(inArray(t.bookings.id, [inside.id, before.id, after.id, otherRoom.id]));
      expect(Object.fromEntries(rows.map((b) => [b.id, b.status]))).toEqual({
        [inside.id]: "EXPIRED",
        [before.id]: "HELD",
        [after.id]: "HELD",
        [otherRoom.id]: "HELD",
      });
      const stock = await db
        .select()
        .from(t.inventory)
        .where(eq(t.inventory.roomTypeId, f.room.id));
      expect(stock.map((n) => [n.date, n.held]).sort()).toEqual([
        ["2099-11-12", 1],
        ["2099-11-13", 1],
        [dates[0], 0],
        [dates[1], 0],
        ["2099-11-16", 1],
        ["2099-11-17", 1],
      ]);
      const otherStock = await db
        .select()
        .from(t.inventory)
        .where(eq(t.inventory.roomTypeId, other.room.id));
      expect(otherStock.map((n) => n.held)).toEqual([1, 1]);
      const events = await db
        .select()
        .from(t.bookingEvents)
        .where(
          inArray(
            t.bookingEvents.bookingId,
            rows.map((b) => b.id),
          ),
        );
      expect(events.map((e) => [e.bookingId, e.toStatus])).toEqual([[inside.id, "EXPIRED"]]);
    } finally {
      await other.clean();
    }
  });

  it("uses the supplied now: equality expires once, but a hold one millisecond later remains held", async () => {
    const now = new Date("2099-11-01T10:00:00.000Z");
    const atBoundary = await expiredHold(f, { holdExpiresAt: now });
    const later = await expiredHold(f, { holdExpiresAt: new Date(now.getTime() + 1) });
    await db
      .update(t.inventory)
      .set({ allotment: 2, held: 2 })
      .where(eq(t.inventory.roomTypeId, f.room.id));
    const release = (clock: Date) =>
      db.transaction((tx) => releaseExpiredHoldsInTx(tx, { ...scope(), now: clock }));
    expect(await release(now)).toEqual({ released: 1 });
    expect(await release(now)).toEqual({ released: 0 });
    const rows = await bookingsOfType(db, f.room.id);
    expect(Object.fromEntries(rows.map((b) => [b.id, b.status]))).toEqual({
      [atBoundary.id]: "EXPIRED",
      [later.id]: "HELD",
    });
    const stock = await db.select().from(t.inventory).where(eq(t.inventory.roomTypeId, f.room.id));
    expect(stock.map((n) => n.held)).toEqual([1, 1]);
    expect(await release(new Date(now.getTime() + 1))).toEqual({ released: 1 });
  });

  it("availability without roomTypeId returns every real room and expires only overlapping holds", async () => {
    const other = await coreFixture(db);
    try {
      const inside = await expiredHold();
      const outside = await expiredHold(f, { checkIn: "2099-11-12", checkOut: f.stay.checkIn });
      await expiredHold(other, { holdExpiresAt: new Date(Date.now() + 60 * 60_000) });
      await db
        .update(t.inventory)
        .set({ allotment: 4, sold: 1 })
        .where(eq(t.inventory.roomTypeId, other.room.id));
      const r = await inventory.availability({
        checkIn: f.stay.checkIn,
        checkOut: f.stay.checkOut,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error(r.code);
      const rooms = await db.select({ id: t.roomTypes.id }).from(t.roomTypes);
      expect(r.rooms.map((room) => room.roomTypeId).sort()).toEqual(
        rooms.map((room) => room.id).sort(),
      );
      expect(r.rooms.find((room) => room.roomTypeId === f.room.id)).toEqual({
        roomTypeId: f.room.id,
        availableUnits: 1,
        soldOut: false,
        blackedOut: false,
      });
      expect(r.rooms.find((room) => room.roomTypeId === other.room.id)).toEqual({
        roomTypeId: other.room.id,
        availableUnits: 2,
        soldOut: false,
        blackedOut: false,
      });
      const bookings = await db
        .select()
        .from(t.bookings)
        .where(inArray(t.bookings.id, [inside.id, outside.id]));
      expect(Object.fromEntries(bookings.map((b) => [b.id, b.status]))).toEqual({
        [inside.id]: "EXPIRED",
        [outside.id]: "HELD",
      });
    } finally {
      await other.clean();
    }
  });

  it("unrelated corrupt expired inventory cannot break availability for a requested room or range", async () => {
    const other = await coreFixture(db);
    try {
      const inside = await expiredHold();
      const otherRoom = await expiredHold(other);
      const outside = await expiredHold(f, { checkIn: "2099-11-12", checkOut: f.stay.checkIn });
      // Simulate inconsistent legacy counters using valid CHECK-constrained rows. Releasing these would fail.
      await db
        .update(t.inventory)
        .set({ held: 0 })
        .where(eq(t.inventory.roomTypeId, other.room.id));
      await db
        .update(t.inventory)
        .set({ held: 0 })
        .where(and(eq(t.inventory.roomTypeId, f.room.id), eq(t.inventory.date, outside.checkIn)));
      const r = await inventory.availability(avail());
      expect(r.ok && r.rooms[0].availableUnits).toBe(1);
      const rows = await db
        .select()
        .from(t.bookings)
        .where(inArray(t.bookings.id, [inside.id, otherRoom.id, outside.id]));
      expect(Object.fromEntries(rows.map((b) => [b.id, b.status]))).toEqual({
        [inside.id]: "EXPIRED",
        [otherRoom.id]: "HELD",
        [outside.id]: "HELD",
      });
      // The global maintenance sweep still sees them, and must roll its failed transaction back.
      await expect(booking.releaseExpiredHolds()).rejects.toThrow();
    } finally {
      await other.clean();
    }
  });

  it("unknown or non-UUID room filters do not release another room's holds", async () => {
    const b = await expiredHold();
    for (const roomTypeId of ["unknown", randomUUID()]) {
      expect(await inventory.availability({ ...avail(), roomTypeId })).toEqual({
        ok: true,
        rooms: [],
      });
    }
    expect(
      await db.transaction((tx) =>
        releaseExpiredHoldsInTx(tx, { ...scope(), roomTypeIds: ["unknown"] }),
      ),
    ).toEqual({ released: 0 });
    const [unchanged] = await db.select().from(t.bookings).where(eq(t.bookings.id, b.id));
    expect(unchanged.status).toBe("HELD");
  });
});
