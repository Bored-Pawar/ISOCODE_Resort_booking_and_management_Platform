import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq, sql as query } from "drizzle-orm";
import * as dbModule from "@/lib/db";
import * as t from "@/db/schema";
import { booking } from "@/modules/booking";
import { pricing } from "@/modules/pricing";
import { postgresCode } from "@/modules/booking/transaction";
import { connect, ensureMigrated, testUrl } from "./helpers";
import { coreFixture, dates, testSlabs } from "./core-fixture";

const sql = connect();
const { db, client } = dbModule.createDb(testUrl(), { max: 24 });
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
  try {
    await reconcile();
  } finally {
    await f?.clean();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});
afterAll(async () => {
  await cleanSlabs?.();
  await client.end();
  await sql.end();
});

async function quote(stay = f.stay) {
  const result = await pricing.quote(stay);
  if (!result.ok) throw new Error(result.code);
  return result.quote;
}
async function hold(stay = f.stay) {
  const q = await quote(stay);
  const r = await booking.acquireHold({ stay, quoteHash: q.quoteHash, guestId: f.guest.id });
  if (!r.ok) throw new Error(r.code);
  return r.booking;
}
async function stock() {
  return db
    .select()
    .from(t.inventory)
    .where(eq(t.inventory.roomTypeId, f.room.id))
    .orderBy(asc(t.inventory.date));
}
async function reconcile() {
  if (!f) return;
  const mismatches =
    await db.execute(query`SELECT i.date FROM inventory i WHERE i.room_type_id=${f.room.id}::uuid AND (
    i.held <> (SELECT coalesce(sum(b.units),0) FROM bookings b WHERE b.room_type_id=i.room_type_id AND b.status='HELD' AND b.check_in<=i.date AND b.check_out>i.date)
    OR i.sold <> (SELECT coalesce(sum(b.units),0) FROM bookings b WHERE b.room_type_id=i.room_type_id AND b.status='CONFIRMED' AND b.check_in<=i.date AND b.check_out>i.date))`);
  expect(mismatches).toHaveLength(0);
}
async function extend() {
  await db
    .insert(t.inventory)
    .values({ roomTypeId: f.room.id, date: f.stay.checkOut, allotment: 1 });
  await db
    .insert(t.dailyRates)
    .values({
      roomTypeId: f.room.id,
      ratePlanId: f.plan.id,
      date: f.stay.checkOut,
      pricePaise: 750000,
    });
}

describe("B3 atomic holds", () => {
  it("mandatory 1: twenty simultaneous last-unit holds produce exactly one winner", async () => {
    const q = await quote();
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        booking.acquireHold({ stay: f.stay, quoteHash: q.quoteHash, guestId: f.guest.id }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.code === "SOLD_OUT")).toBe(true);
    expect((await stock()).map((n) => [n.held, n.sold])).toEqual([
      [1, 0],
      [1, 0],
    ]);
    const rows = await db.select().from(t.bookings).where(eq(t.bookings.roomTypeId, f.room.id));
    expect(rows).toHaveLength(1);
    expect(
      await db.select().from(t.bookingEvents).where(eq(t.bookingEvents.bookingId, rows[0].id)),
    ).toHaveLength(1);
  }, 120_000);

  it("mandatory 2: one unavailable night rolls back the entire hold", async () => {
    await db
      .update(t.inventory)
      .set({ allotment: 0 })
      .where(and(eq(t.inventory.roomTypeId, f.room.id), eq(t.inventory.date, dates[1])));
    const q = await quote();
    expect(
      await booking.acquireHold({ stay: f.stay, quoteHash: q.quoteHash, guestId: f.guest.id }),
    ).toEqual({ ok: false, code: "SOLD_OUT" });
    expect((await stock()).map((n) => n.held)).toEqual([0, 0]);
    expect(
      await db.select().from(t.bookings).where(eq(t.bookings.roomTypeId, f.room.id)),
    ).toHaveLength(0);
  });

  it("mandatory 6: allotment below committed stock is rejected", async () => {
    await hold();
    const changed = await db
      .update(t.inventory)
      .set({ allotment: 0 })
      .where(
        and(
          eq(t.inventory.roomTypeId, f.room.id),
          query`${t.inventory.sold} + ${t.inventory.held} <= 0`,
        ),
      )
      .returning();
    expect(changed).toHaveLength(0);
    try {
      await db
        .update(t.inventory)
        .set({ allotment: 0 })
        .where(eq(t.inventory.roomTypeId, f.room.id));
      throw new Error("Expected CHECK failure");
    } catch (error) {
      expect(postgresCode(error)).toBe("23514");
    }
    expect((await stock()).map((n) => n.allotment)).toEqual([1, 1]);
  });

  it("mandatory 7: a blackout rejects a hold without acquiring inventory", async () => {
    await db
      .insert(t.blackoutDates)
      .values({ roomTypeId: f.room.id, startDate: dates[1], endDate: dates[1] });
    const q = await quote();
    expect(
      await booking.acquireHold({ stay: f.stay, quoteHash: q.quoteHash, guestId: f.guest.id }),
    ).toEqual({ ok: false, code: "BLACKOUT" });
    expect((await stock()).map((n) => n.held)).toEqual([0, 0]);
  });

  it("mandatory 9: changed quote returns PRICE_CHANGED and rolls back even initial lazy expiry", async () => {
    const old = await hold();
    await db
      .update(t.bookings)
      .set({ holdExpiresAt: new Date(0) })
      .where(eq(t.bookings.id, old.id));
    const q = await quote();
    await db
      .update(t.dailyRates)
      .set({ pricePaise: 900000 })
      .where(eq(t.dailyRates.roomTypeId, f.room.id));
    const result = await booking.acquireHold({
      stay: f.stay,
      quoteHash: q.quoteHash,
      guestId: f.guest.id,
    });
    expect(result.ok).toBe(false);
    if (result.ok || result.code !== "PRICE_CHANGED") throw new Error("Expected PRICE_CHANGED");
    expect(result.quote.quoteHash).not.toBe(q.quoteHash);
    const [unchanged] = await db.select().from(t.bookings).where(eq(t.bookings.id, old.id));
    expect(unchanged.status).toBe("HELD");
    expect((await stock()).map((n) => n.held)).toEqual([1, 1]);
    expect(
      await db.select().from(t.bookingEvents).where(eq(t.bookingEvents.bookingId, old.id)),
    ).toHaveLength(1);
  });

  it("overlapping multi-night requests compete atomically", async () => {
    await extend();
    const other = { ...f.stay, checkIn: dates[1], checkOut: "2099-11-17" };
    const qs = await Promise.all([quote(), quote(other)]);
    const results = await Promise.all(
      [f.stay, other].map((stay, i) =>
        booking.acquireHold({ stay, quoteHash: qs[i].quoteHash, guestId: f.guest.id }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    await reconcile();
  }, 60_000);

  it("honours HOLD_MINUTES and freezes saved nights after rates change; reads enforce ownership", async () => {
    vi.stubEnv("HOLD_MINUTES", "3");
    const before = Date.now();
    const b = await hold();
    expect(Date.parse(b.holdExpiresAt!) - before).toBeGreaterThanOrEqual(179_000);
    expect(Date.parse(b.holdExpiresAt!) - Date.now()).toBeLessThanOrEqual(180_000);
    await db
      .update(t.dailyRates)
      .set({ pricePaise: 100 })
      .where(eq(t.dailyRates.roomTypeId, f.room.id));
    expect(await booking.get({ ref: b.ref }, { userId: f.guest.id, role: "guest" })).toEqual({
      ok: true,
      booking: b,
    });
    expect(await booking.get({ ref: b.ref }, { userId: randomUUID(), role: "guest" })).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(
      (await booking.get({ ref: b.ref }, { userId: randomUUID(), role: "reservations" })).ok,
    ).toBe(true);
  });

  it("repricing preserves PROMO_INVALID, OVER_OCCUPANCY and NO_RATE without writes", async () => {
    const promo = await f.promo();
    const stay = { ...f.stay, promoCode: promo.code };
    const q = await quote(stay);
    await db.update(t.promoCodes).set({ active: false }).where(eq(t.promoCodes.id, promo.id));
    expect(
      await booking.acquireHold({ stay, quoteHash: q.quoteHash, guestId: f.guest.id }),
    ).toEqual({ ok: false, code: "PROMO_INVALID" });
    expect(
      await booking.acquireHold({
        stay: { ...f.stay, adults: 3 },
        quoteHash: q.quoteHash,
        guestId: f.guest.id,
      }),
    ).toEqual({ ok: false, code: "OVER_OCCUPANCY" });
    await db.delete(t.dailyRates).where(eq(t.dailyRates.roomTypeId, f.room.id));
    expect(
      await booking.acquireHold({ stay: f.stay, quoteHash: q.quoteHash, guestId: f.guest.id }),
    ).toEqual({ ok: false, code: "NO_RATE" });
  });

  it("a failed booking FK insert rolls stock back", async () => {
    const q = await quote();
    await expect(
      booking.acquireHold({ stay: f.stay, quoteHash: q.quoteHash, guestId: randomUUID() }),
    ).rejects.toBeDefined();
    expect((await stock()).map((n) => n.held)).toEqual([0, 0]);
  });

  it("a PostgreSQL audit insert failure rolls booking, nights and stock back", async () => {
    const realTransaction = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementation((fn, config) =>
      realTransaction(async (tx) => {
        const insert = tx.insert.bind(tx);
        vi.spyOn(tx, "insert").mockImplementation(((table: typeof t.bookingEvents) => {
          const builder = insert(table);
          if (table === t.bookingEvents) {
            const values = builder.values.bind(builder);
            vi.spyOn(builder, "values").mockImplementation((value) =>
              values({ ...value, actor: null } as never),
            );
          }
          return builder;
        }) as typeof tx.insert);
        return fn(tx);
      }, config),
    );
    const q = await quote();
    await expect(
      booking.acquireHold({ stay: f.stay, quoteHash: q.quoteHash, guestId: f.guest.id }),
    ).rejects.toBeDefined();
    expect((await stock()).map((n) => n.held)).toEqual([0, 0]);
    expect(
      await db.select().from(t.bookings).where(eq(t.bookings.roomTypeId, f.room.id)),
    ).toHaveLength(0);
  });

  it.each(["40P01", "40001"])("retries the complete transaction once for %s", async (code) => {
    const realTransaction = db.transaction.bind(db);
    let attempts = 0;
    vi.spyOn(db, "transaction").mockImplementation((fn, config) =>
      realTransaction(async (tx) => {
        const result = await fn(tx);
        if (++attempts === 1)
          await tx.execute(
            query.raw(
              `DO $$ BEGIN RAISE EXCEPTION 'injected conflict' USING ERRCODE = '${code}'; END $$`,
            ),
          );
        return result;
      }, config),
    );
    await hold();
    expect(attempts).toBe(2);
    expect((await stock()).map((n) => n.held)).toEqual([1, 1]);
    expect(
      await db.select().from(t.bookings).where(eq(t.bookings.roomTypeId, f.room.id)),
    ).toHaveLength(1);
  });

  it("returns SOLD_OUT after the second transaction conflict, with no committed changes", async () => {
    const realTransaction = db.transaction.bind(db);
    let attempts = 0;
    vi.spyOn(db, "transaction").mockImplementation((fn, config) =>
      realTransaction(async (tx) => {
        await fn(tx);
        attempts++;
        await tx.execute(
          query.raw(
            "DO $$ BEGIN RAISE EXCEPTION 'injected conflict' USING ERRCODE = '40001'; END $$",
          ),
        );
        throw new Error("unreachable");
      }, config),
    );
    const q = await quote();
    expect(
      await booking.acquireHold({ stay: f.stay, quoteHash: q.quoteHash, guestId: f.guest.id }),
    ).toEqual({ ok: false, code: "SOLD_OUT" });
    expect(attempts).toBe(2);
    expect((await stock()).map((n) => n.held)).toEqual([0, 0]);
  });
});
