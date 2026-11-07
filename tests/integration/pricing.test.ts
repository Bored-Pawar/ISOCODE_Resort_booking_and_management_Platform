import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import * as dbModule from "@/lib/db";
import * as t from "@/db/schema";
import { pricing } from "@/modules/pricing";
import { quoteInTx } from "@/modules/pricing/internal";
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

describe("B1 database pricing", () => {
  it("reads both sides of the nightly GST boundary and reprices identically in a shared transaction", async () => {
    const result = await pricing.quote(f.stay);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.quote.nights.map((n) => n.gstBp)).toEqual([500, 1800]);
    expect(result.quote.totalPaise).toBe(1672501);
    expect(await db.transaction((tx) => quoteInTx(tx, f.stay))).toEqual(result);
  });
  it("rejects missing rates, inactive/mismatched plans, nonexistent rooms, and over occupancy", async () => {
    expect(await pricing.quote({ ...f.stay, adults: 3 })).toEqual({
      ok: false,
      code: "OVER_OCCUPANCY",
    });
    expect(await pricing.quote({ ...f.stay, children: 2 })).toEqual({
      ok: false,
      code: "OVER_OCCUPANCY",
    });
    expect(await pricing.quote({ ...f.stay, roomTypeId: "unknown" })).toEqual({
      ok: false,
      code: "NO_RATE",
    });
    await db
      .delete(t.dailyRates)
      .where(and(eq(t.dailyRates.roomTypeId, f.room.id), eq(t.dailyRates.date, dates[1])));
    expect(await pricing.quote(f.stay)).toEqual({ ok: false, code: "NO_RATE" });
    await db.update(t.ratePlans).set({ active: false }).where(eq(t.ratePlans.id, f.plan.id));
    expect(await pricing.quote(f.stay)).toEqual({ ok: false, code: "NO_RATE" });
  });
  it("validates promo activity, whole-stay dates, minimum nights, and usage limit", async () => {
    const promo = await f.promo();
    const stay = { ...f.stay, promoCode: promo.code.toLowerCase() };
    const result = await pricing.quote(stay);
    expect(result.ok && result.quote.promo?.code).toBe(promo.code);
    expect(result.ok && result.quote.nights.map((n) => n.gstBp)).toEqual([500, 500]);
    for (const patch of [
      { active: false },
      { validFrom: dates[1] },
      { validTo: dates[0] },
      { minNights: 3 },
      { usedCount: 1 },
    ]) {
      await db
        .update(t.promoCodes)
        .set({
          active: true,
          validFrom: dates[0],
          validTo: dates[1],
          minNights: 2,
          usedCount: 0,
          ...patch,
        })
        .where(eq(t.promoCodes.id, promo.id));
      expect(await pricing.quote(stay)).toEqual({ ok: false, code: "PROMO_INVALID" });
    }
    expect(await pricing.quote({ ...stay, promoCode: "UNKNOWN" })).toEqual({
      ok: false,
      code: "PROMO_INVALID",
    });
  });
  it("redistributes the R09 flat discount, with runtime and seed snapshot arithmetic matching", async () => {
    await db
      .update(t.dailyRates)
      .set({ pricePaise: 100 })
      .where(and(eq(t.dailyRates.roomTypeId, f.room.id), eq(t.dailyRates.date, dates[0])));
    await db
      .update(t.dailyRates)
      .set({ pricePaise: 1000 })
      .where(and(eq(t.dailyRates.roomTypeId, f.room.id), eq(t.dailyRates.date, dates[1])));
    const p = await f.promo({ kind: "flat", value: 600 });
    const r = await pricing.quote({ ...f.stay, promoCode: p.code });
    expect(r.ok && r.quote.nights.map((n) => n.discountPaise)).toEqual([100, 500]);
    expect(r.ok && r.quote.totalPaise).toBe(525);
  });
  it("matches a lowercase stored promo regardless of the guest input's case", async () => {
    const promo = await f.promo({ code: `lower-${f.room.slug.slice(0, 8)}` });
    const lower = await pricing.quote({ ...f.stay, promoCode: promo.code });
    const upper = await pricing.quote({ ...f.stay, promoCode: promo.code.toUpperCase() });
    expect(lower.ok).toBe(true);
    expect(upper).toEqual(lower);
    expect(lower.ok && lower.quote.promo?.code).toBe(promo.code);
    expect(lower.ok && lower.quote.discountPaise).toBeGreaterThan(0);
  });
  it("uses a different slab effective date on the second night", async () => {
    const [s] = await db
      .insert(t.taxSlabs)
      .values({ minPaise: 0, maxPaise: null, gstBp: 1200, effectiveFrom: dates[1] })
      .returning();
    try {
      const r = await pricing.quote(f.stay);
      expect(r.ok && r.quote.nights.map((n) => n.gstBp)).toEqual([500, 1200]);
    } finally {
      await db.delete(t.taxSlabs).where(eq(t.taxSlabs.id, s.id));
    }
  });
});
