import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import * as dbModule from "@/lib/db";
import * as t from "@/db/schema";
import { admin } from "@/modules/admin";
import { booking } from "@/modules/booking";
import { pricing } from "@/modules/pricing";
import { connect, ensureMigrated, testUrl } from "./helpers";
import { adminFixture, DAYS14, START } from "./admin-fixture";

const sql = connect();
const { db, client } = dbModule.createDb(testUrl(), { max: 5 });
let f: Awaited<ReturnType<typeof adminFixture>>;

beforeAll(async () => {
  await ensureMigrated(sql);
});
beforeEach(async () => {
  vi.spyOn(dbModule, "getDb").mockReturnValue(db);
  f = await adminFixture(db);
});
afterEach(async () => {
  await f?.clean();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await client.end();
  await sql.end();
});

/** A code no other test or seed row uses. */
const fresh = () => `T${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const promoInput = (code: string, over: Record<string, unknown> = {}) => ({
  code,
  kind: "pct" as const,
  value: 10,
  validFrom: START,
  validTo: DAYS14[13],
  minNights: 1,
  maxUses: null,
  ...over,
});

async function create(code: string, over: Record<string, unknown> = {}) {
  const res = await admin.createPromo(promoInput(code, over), f.reservations);
  if (res.ok) f.trackPromo(res.promo.id);
  return res;
}

describe("A4 promos (PostgreSQL)", () => {
  it("stores the code uppercase and rejects a case-only duplicate (test 7)", async () => {
    const code = fresh();
    const res = await create(code.toLowerCase());
    expect(res).toMatchObject({ ok: true, promo: { code: code.toUpperCase(), active: true } });
    expect(await create(code.toLowerCase())).toEqual({
      ok: false,
      code: "DUPLICATE_CODE",
      existing: code.toUpperCase(),
    });
    expect(await create(code)).toMatchObject({ ok: false, code: "DUPLICATE_CODE" });
  });

  it("rejects a code that matches a legacy lower-case row ignoring case", async () => {
    const code = fresh();
    const [legacy] = await db
      .insert(t.promoCodes)
      .values({
        code: code.toLowerCase(),
        kind: "pct",
        value: 5,
        validFrom: START,
        validTo: DAYS14[13],
      })
      .returning();
    f.trackPromo(legacy.id);
    expect(await create(code)).toEqual({
      ok: false,
      code: "DUPLICATE_CODE",
      existing: code.toLowerCase(),
    });
  });

  it("two concurrent creates of the same code: exactly one wins", async () => {
    const code = fresh();
    const results = await Promise.all([create(code), create(code.toLowerCase())]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "DUPLICATE_CODE")).toHaveLength(1);
  });

  it("stores flat values as paise", async () => {
    const res = await create(fresh(), { kind: "flat", value: 1500 });
    expect(res).toMatchObject({ ok: true, promo: { kind: "flat", value: 150000 } });
  });

  it("a deactivated promo gives PROMO_INVALID at quote; bookings already made keep their discount", async () => {
    const code = fresh();
    const created = await create(code);
    if (!created.ok) throw new Error(created.code);
    const stay = {
      checkIn: DAYS14[1],
      checkOut: DAYS14[3],
      promoCode: code.toLowerCase(),
      rooms: [{ roomTypeId: f.room.id, ratePlanId: f.ep.id, adults: 2, children: 0 }],
    };
    const q = await pricing.quote(stay);
    if (!q.ok) throw new Error(q.code);
    expect(q.quote.discountPaise).toBe(100000);
    const held = await booking.acquireHold({
      stay,
      quoteHash: q.quote.quoteHash,
      guestId: await f.newGuest(),
    });
    if (!held.ok) throw new Error(held.code);

    expect(await admin.deactivatePromo({ id: created.promo.id }, f.gm)).toMatchObject({
      ok: true,
      promo: { active: false },
    });
    expect(await pricing.quote(stay)).toEqual({ ok: false, code: "PROMO_INVALID" });
    const [kept] = await db.select().from(t.bookings).where(eq(t.bookings.id, held.booking.id));
    expect(kept.discountPaise).toBe(100000);
    expect(kept.promoId).toBe(created.promo.id);
  });

  it("validates on the server too", async () => {
    expect(await create(fresh(), { value: 101 })).toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
      errors: { value: expect.any(String) },
    });
    expect(await create(fresh(), { validTo: "2000-01-01" })).toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
      errors: { validTo: expect.any(String) },
    });
    expect(await admin.deactivatePromo({ id: randomUUID() }, f.reservations)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("sales and guests get FORBIDDEN and nothing is written (test 8)", async () => {
    const code = fresh();
    for (const who of [f.sales, f.guest]) {
      expect(await admin.createPromo(promoInput(code), who)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(await admin.listPromos(who)).toEqual({ ok: false, code: "FORBIDDEN" });
      expect(await admin.deactivatePromo({ id: randomUUID() }, who)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
    }
    const rows = await db.select().from(t.promoCodes).where(eq(t.promoCodes.code, code));
    expect(rows).toEqual([]);
  });

  it("lists promos with usage", async () => {
    const created = await create(fresh(), { maxUses: 5 });
    if (!created.ok) throw new Error(created.code);
    const res = await admin.listPromos(f.reservations);
    if (!res.ok) throw new Error(res.code);
    expect(res.promos.find((p) => p.id === created.promo.id)).toMatchObject({
      usedCount: 0,
      maxUses: 5,
      active: true,
    });
  });
});
