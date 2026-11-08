/**
 * B10 multi-room tests, docs/s2-multiroom-change.md section 6 (new tests 1 to 6 and 8 on
 * PostgreSQL; test 7 is unit level in src/modules/pricing and src/lib/occupancy, with the
 * database lineIndex paths covered here as well).
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq, inArray, sql as query } from "drizzle-orm";
import * as dbModule from "@/lib/db";
import * as t from "@/db/schema";
import { booking, type AcquireHoldResult } from "@/modules/booking";
import { releaseExpiredHoldsInTx } from "@/modules/booking/internal";
import { pricing, type QuoteInput } from "@/modules/pricing";
import { connect, ensureMigrated, testUrl } from "./helpers";
import {
  bookingsOfType,
  cart,
  coreFixture,
  dates,
  reconcileTypes,
  testSlabs,
} from "./core-fixture";

const sql = connect();
const { db, client } = dbModule.createDb(testUrl(), { max: 12 });
let T1: Awaited<ReturnType<typeof coreFixture>>;
let T2: Awaited<ReturnType<typeof coreFixture>>;
let cleanSlabs: Awaited<ReturnType<typeof testSlabs>>;

beforeAll(async () => {
  await ensureMigrated(sql);
  cleanSlabs = await testSlabs(db);
});
beforeEach(async () => {
  vi.spyOn(dbModule, "getDb").mockReturnValue(db);
  T1 = await coreFixture(db);
  T2 = await coreFixture(db, [500000, 500000]);
});
afterEach(async () => {
  try {
    if (T1 && T2) await reconcile();
  } finally {
    await T1?.clean();
    await T2?.clean();
    vi.restoreAllMocks();
  }
});
afterAll(async () => {
  await cleanSlabs?.();
  await client.end();
  await sql.end();
});

async function reconcile() {
  expect(await reconcileTypes(db, [T1.room.id, T2.room.id])).toHaveLength(0);
}
async function quoteOf(stay: QuoteInput) {
  const r = await pricing.quote(stay);
  if (!r.ok) throw new Error(r.code);
  return r.quote;
}
async function holdCart(
  stay: QuoteInput,
  hash?: string,
  guestId: string = T1.guest.id,
): Promise<AcquireHoldResult> {
  const quoteHash = hash ?? (await quoteOf(stay)).quoteHash;
  return booking.acquireHold({ stay, quoteHash, guestId });
}
async function heldOk(stay: QuoteInput) {
  const r = await holdCart(stay);
  if (!r.ok) throw new Error(r.code);
  return r.booking;
}
/** [held, sold] per night for one fixture's room type. */
async function stockOf(f: typeof T1) {
  const rows = await db
    .select()
    .from(t.inventory)
    .where(eq(t.inventory.roomTypeId, f.room.id))
    .orderBy(asc(t.inventory.date));
  return rows.map((n) => [n.held, n.sold]);
}
async function setAllotment(f: typeof T1, allotment: number) {
  await db.update(t.inventory).set({ allotment }).where(eq(t.inventory.roomTypeId, f.room.id));
}
async function expireNow(bookingId: string) {
  await db
    .update(t.bookings)
    .set({ holdExpiresAt: new Date(0) })
    .where(eq(t.bookings.id, bookingId));
}
async function releaseOne(bookingId: string) {
  return db.transaction((tx) => releaseExpiredHoldsInTx(tx, { bookingId }));
}
async function deadlockCount() {
  const [row] = await db.execute<{ n: number }>(
    query`SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()`,
  );
  return row.n;
}

// Each test makes several round trips to a remote PostgreSQL; 30 s is too tight on Neon.
describe("B10 multi-room holds on PostgreSQL", { timeout: 120_000 }, () => {
  it("new 1: carts [T1, T2] and [T2, T1] race for the last unit of each: one winner per round, no deadlock", async () => {
    const a = cart([T1.line(), T2.line()]);
    const b = cart([T2.line(), T1.line()]);
    const [qa, qb] = await Promise.all([quoteOf(a), quoteOf(b)]);
    expect(qa.quoteHash).not.toBe(qb.quoteHash);
    const before = await deadlockCount();
    for (let round = 0; round < 10; round++) {
      const results = await Promise.all([holdCart(a, qa.quoteHash), holdCart(b, qb.quoteHash)]);
      const winners = results.filter((r) => r.ok);
      expect(winners).toHaveLength(1);
      const loser = results.find((r) => !r.ok)!;
      expect(loser).toMatchObject({ ok: false, code: "SOLD_OUT" });
      expect([
        [1, 0],
        [1, 0],
      ]).toEqual(await stockOf(T1));
      expect([
        [1, 0],
        [1, 0],
      ]).toEqual(await stockOf(T2));
      await reconcile();
      const won = winners[0];
      if (!won.ok) throw new Error("unreachable");
      expect(won.booking.rooms.map((r) => r.roomTypeId)).toHaveLength(2);
      await expireNow(won.booking.id);
      expect(await releaseOne(won.booking.id)).toEqual({ released: 1 });
      await reconcile();
    }
    // Cumulative statistics are flushed by idle backends within about 10 s.
    await new Promise((resolve) => setTimeout(resolve, 11_000));
    expect((await deadlockCount()) - before).toBe(0);
  }, 240_000);

  it("new 2: [T1, T1] versus [T1, T2] with 2 units of T1 left never exceeds the allotment", async () => {
    await setAllotment(T1, 2);
    const double = cart([T1.line(), T1.line()]);
    const mixed = cart([T1.line(), T2.line()]);
    const [qd, qm] = await Promise.all([quoteOf(double), quoteOf(mixed)]);
    for (let round = 0; round < 5; round++) {
      const results = await Promise.all([
        holdCart(double, qd.quoteHash),
        holdCart(mixed, qm.quoteHash),
        // A second guest: one guest's identical carts are one hold (01 Contract note 7).
        holdCart(mixed, qm.quoteHash, T2.guest.id),
      ]);
      const stock = await stockOf(T1);
      expect(stock.every(([held, sold]) => held + sold <= 2)).toBe(true);
      const winners = results.filter((r) => r.ok);
      // Either the double cart takes both T1 units, or the two mixed carts take one each (T2 has
      // only 1 unit, so at most one mixed cart can win): 1 winner, never more than 2 T1 units.
      expect(winners).toHaveLength(1);
      expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.code === "SOLD_OUT")).toBe(true);
      await reconcile();
      for (const w of winners) {
        if (!w.ok) continue;
        await expireNow(w.booking.id);
        await releaseOne(w.booking.id);
      }
      await reconcile();
    }
  }, 240_000);

  it("new 3: 2 x T1 with 1 unit left is SOLD_OUT naming T1, and T2 in the same cart is untouched", async () => {
    const r = await holdCart(cart([T1.line(), T2.line(), T1.line()]));
    expect(r).toEqual({ ok: false, code: "SOLD_OUT", roomTypeId: T1.room.id });
    expect(await stockOf(T1)).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(await stockOf(T2)).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(await bookingsOfType(db, T2.room.id)).toHaveLength(0);
  });

  it("new 4: a blackout on one type of a 2-type cart rejects the whole cart", async () => {
    await db
      .insert(t.blackoutDates)
      .values({ roomTypeId: T2.room.id, startDate: dates[1], endDate: dates[1] });
    expect(await holdCart(cart([T1.line(), T2.line()]))).toEqual({ ok: false, code: "BLACKOUT" });
    expect(await stockOf(T1)).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(await stockOf(T2)).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(await bookingsOfType(db, T1.room.id)).toHaveLength(0);
  });

  it("new 5: concurrent expiry of a 2-type booking releases both types once with one event", async () => {
    const b = await heldOk(cart([T1.line(), T2.line()]));
    expect(await stockOf(T1)).toEqual([
      [1, 0],
      [1, 0],
    ]);
    expect(await stockOf(T2)).toEqual([
      [1, 0],
      [1, 0],
    ]);
    await expireNow(b.id);
    const results = await Promise.all(Array.from({ length: 4 }, () => releaseOne(b.id)));
    expect(results.reduce((n, r) => n + r.released, 0)).toBe(1);
    expect(await stockOf(T1)).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(await stockOf(T2)).toEqual([
      [0, 0],
      [0, 0],
    ]);
    const events = await db
      .select()
      .from(t.bookingEvents)
      .where(and(eq(t.bookingEvents.bookingId, b.id), eq(t.bookingEvents.toStatus, "EXPIRED")));
    expect(events).toHaveLength(1);
  });

  it("new 6: confirming a [T1, T2, T1] booking sells per type per night; a duplicate webhook is a no-op", async () => {
    await setAllotment(T1, 2);
    const promo = await T1.promo({ kind: "flat", value: 100000 });
    const b = await heldOk(
      cart([T1.line(), T2.line(), T1.line({ adults: 1, children: 2 })], { promoCode: promo.code }),
    );
    expect(b.rooms.map((r) => [r.lineNo, r.roomTypeId, r.adults, r.children])).toEqual([
      [1, T1.room.id, 2, 0],
      [2, T2.room.id, 2, 0],
      [3, T1.room.id, 1, 2],
    ]);
    expect(b.rooms.reduce((s, r) => s + r.totalPaise, 0)).toBe(b.totalPaise);
    expect(b.discountPaise).toBe(100000);
    expect(await stockOf(T1)).toEqual([
      [2, 0],
      [2, 0],
    ]);
    const pay = (providerPaymentId: string) =>
      booking.confirmPayment({
        bookingId: b.id,
        provider: "mock",
        providerPaymentId,
        amountPaise: b.totalPaise,
      });
    const id = randomUUID();
    const results = await Promise.all([pay(id), pay(id), pay(id)]);
    expect(results.filter((r) => r.ok && r.outcome === "CONFIRMED")).toHaveLength(1);
    expect(results.filter((r) => r.ok && r.outcome === "ALREADY_CONFIRMED")).toHaveLength(2);
    expect(await stockOf(T1)).toEqual([
      [0, 2],
      [0, 2],
    ]);
    expect(await stockOf(T2)).toEqual([
      [0, 1],
      [0, 1],
    ]);
    expect(await pay(id)).toMatchObject({ ok: true, outcome: "ALREADY_CONFIRMED" });
    expect(await stockOf(T1)).toEqual([
      [0, 2],
      [0, 2],
    ]);
    const [used] = await db.select().from(t.promoCodes).where(eq(t.promoCodes.id, promo.id));
    expect(used.usedCount).toBe(1);
    const events = await db
      .select()
      .from(t.bookingEvents)
      .where(eq(t.bookingEvents.bookingId, b.id));
    expect(events.map((e) => e.toStatus).sort()).toEqual(["CONFIRMED", "HELD"]);
    const read = await booking.get({ ref: b.ref }, { userId: T1.guest.id, role: "guest" });
    expect(read.ok && read.booking.rooms).toEqual(b.rooms);
  });

  it("new 8: one line's rate change returns PRICE_CHANGED and takes no stock for any type", async () => {
    const stay = cart([T1.line(), T2.line()]);
    const q = await quoteOf(stay);
    await db
      .update(t.dailyRates)
      .set({ pricePaise: 510000 })
      .where(and(eq(t.dailyRates.roomTypeId, T2.room.id), eq(t.dailyRates.date, dates[0])));
    const r = await holdCart(stay, q.quoteHash);
    expect(r.ok).toBe(false);
    if (r.ok || r.code !== "PRICE_CHANGED") throw new Error("Expected PRICE_CHANGED");
    expect(r.quote.quoteHash).not.toBe(q.quoteHash);
    expect(r.quote.lines[0]).toEqual(q.lines[0]);
    expect(r.quote.lines[1].nights[0].ratePaise).toBe(510000);
    expect(await stockOf(T1)).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(await stockOf(T2)).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(await bookingsOfType(db, T1.room.id)).toHaveLength(0);
  });

  it("new 7 (database paths): line errors carry lineIndex in quote and hold, with no writes", async () => {
    const overfull = cart([T1.line(), T2.line({ adults: 2, children: 2 })]);
    expect(await pricing.quote(overfull)).toEqual({
      ok: false,
      code: "OVER_OCCUPANCY",
      lineIndex: 1,
    });
    expect(await holdCart(overfull, "any")).toEqual({
      ok: false,
      code: "OVER_OCCUPANCY",
      lineIndex: 1,
    });
    await db
      .delete(t.dailyRates)
      .where(and(eq(t.dailyRates.roomTypeId, T2.room.id), eq(t.dailyRates.date, dates[1])));
    const noRate = cart([T1.line(), T1.line(), T2.line()]);
    await setAllotment(T1, 2);
    expect(await pricing.quote(noRate)).toEqual({ ok: false, code: "NO_RATE", lineIndex: 2 });
    expect(await holdCart(noRate, "any")).toEqual({ ok: false, code: "NO_RATE", lineIndex: 2 });
    // A plan of another room type on a line is not a rate for that line.
    expect(await pricing.quote(cart([T1.line({ ratePlanId: T2.plan.id })]))).toEqual({
      ok: false,
      code: "NO_RATE",
      lineIndex: 0,
    });
    expect(await stockOf(T1)).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(
      await db
        .select()
        .from(t.bookingRooms)
        .where(inArray(t.bookingRooms.roomTypeId, [T1.room.id, T2.room.id])),
    ).toHaveLength(0);
  });

  it("a 2-room GST cell rule holds in the database: two 5% rooms are not summed into 18%", async () => {
    await db
      .update(t.dailyRates)
      .set({ pricePaise: 400000 })
      .where(inArray(t.dailyRates.roomTypeId, [T1.room.id, T2.room.id]));
    const q = await quoteOf(cart([T1.line(), T2.line()]));
    expect(q.lines.flatMap((l) => l.nights.map((n) => n.gstBp))).toEqual([500, 500, 500, 500]);
    expect(q.totalPaise).toBe(4 * 420000);
  });
});
