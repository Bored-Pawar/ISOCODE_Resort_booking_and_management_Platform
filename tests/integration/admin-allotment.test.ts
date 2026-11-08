import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import * as dbModule from "@/lib/db";
import * as t from "@/db/schema";
import { addDays } from "@/lib/dates";
import { admin } from "@/modules/admin";
import { booking } from "@/modules/booking";
import { pricing } from "@/modules/pricing";
import { connect, ensureMigrated, testUrl } from "./helpers";
import { adminFixture, DAYS14, START } from "./admin-fixture";
import { reconcileTypes } from "./core-fixture";

const sql = connect();
const { db, client } = dbModule.createDb(testUrl(), { max: 12 });
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

const END = DAYS14[DAYS14.length - 1];
const ALL = [0, 1, 2, 3, 4, 5, 6];

async function holdFor(checkIn: string, checkOut: string) {
  const stay = {
    checkIn,
    checkOut,
    rooms: [{ roomTypeId: f.room.id, ratePlanId: f.ep.id, adults: 2, children: 0 }],
  };
  const q = await pricing.quote(stay);
  if (!q.ok) throw new Error(q.code);
  return booking.acquireHold({ stay, quoteHash: q.quote.quoteHash, guestId: await f.newGuest() });
}

const setNight = (date: string, v: Partial<typeof t.inventory.$inferInsert>) =>
  db
    .update(t.inventory)
    .set(v)
    .where(and(eq(t.inventory.roomTypeId, f.room.id), eq(t.inventory.date, date)));

describe("A2 setAllotment (PostgreSQL)", () => {
  it("mandatory 6 via A2: a cut below sold + held is rejected for those dates only, the rest apply", async () => {
    const held = await holdFor(DAYS14[2], DAYS14[4]); // held 1 on nights 2 and 3
    expect(held.ok).toBe(true);
    await setNight(DAYS14[6], { sold: 3 });

    const res = await admin.setAllotment(
      { mode: "range", roomTypeIds: [f.room.id], from: START, to: END, days: ALL, allotment: 0 },
      f.reservations,
    );
    if (!res.ok) throw new Error(res.code);
    expect(res.updated).toBe(11);
    expect(res.rejected).toEqual([
      {
        roomTypeId: f.room.id,
        date: DAYS14[2],
        requested: 0,
        min: 1,
        cap: 8,
        reason: "BELOW_COMMITTED",
      },
      {
        roomTypeId: f.room.id,
        date: DAYS14[3],
        requested: 0,
        min: 1,
        cap: 8,
        reason: "BELOW_COMMITTED",
      },
      {
        roomTypeId: f.room.id,
        date: DAYS14[6],
        requested: 0,
        min: 3,
        cap: 8,
        reason: "BELOW_COMMITTED",
      },
    ]);
    const rows = await f.inventoryRows();
    for (const r of rows) {
      const kept = [DAYS14[2], DAYS14[3], DAYS14[6]].includes(r.date);
      expect(r.allotment, r.date).toBe(kept ? 4 : 0);
    }
    // The real hold is untouched by the refused cut.
    expect(rows.filter((r) => r.held === 1).map((r) => r.date)).toEqual([DAYS14[2], DAYS14[3]]);
  });

  it("a cut to exactly sold + held applies", async () => {
    await setNight(START, { sold: 2, held: 1 });
    const res = await admin.setAllotment(
      { mode: "cells", cells: [{ roomTypeId: f.room.id, date: START, allotment: 3 }] },
      f.gm,
    );
    expect(res).toEqual({ ok: true, updated: 1, rejected: [] });
  });

  it("allotment above total units is rejected with the cap; equal to total units applies", async () => {
    const res = await admin.setAllotment(
      {
        mode: "cells",
        cells: [
          { roomTypeId: f.room.id, date: START, allotment: 9 },
          { roomTypeId: f.room.id, date: DAYS14[1], allotment: 8 },
        ],
      },
      f.reservations,
    );
    expect(res).toEqual({
      ok: true,
      updated: 1,
      rejected: [
        { roomTypeId: f.room.id, date: START, requested: 9, min: 0, cap: 8, reason: "ABOVE_TOTAL" },
      ],
    });
    const rows = await f.inventoryRows();
    expect(rows.find((r) => r.date === START)?.allotment).toBe(4);
    expect(rows.find((r) => r.date === DAYS14[1])?.allotment).toBe(8);
  });

  it("creates missing inventory rows inside the horizon with sold and held 0", async () => {
    const date = addDays(END, 3);
    const res = await admin.setAllotment(
      { mode: "cells", cells: [{ roomTypeId: f.room.id, date, allotment: 5 }] },
      f.reservations,
    );
    expect(res).toEqual({ ok: true, updated: 1, rejected: [] });
    const row = (await f.inventoryRows()).find((r) => r.date === date);
    expect(row).toMatchObject({ allotment: 5, sold: 0, held: 0 });
  });

  it("bulk respects the day-of-week filter", async () => {
    const res = await admin.setAllotment(
      { mode: "range", roomTypeIds: [f.room.id], from: START, to: END, days: [5, 6], allotment: 2 },
      f.reservations,
    );
    if (!res.ok) throw new Error(res.code);
    expect(res.updated).toBe(4);
    for (const r of await f.inventoryRows()) {
      const dow = new Date(`${r.date}T00:00:00Z`).getUTCDay();
      expect(r.allotment).toBe(dow === 5 || dow === 6 ? 2 : 4);
    }
  });

  it("an allotment cut racing 10 parallel holds on the last unit never breaks the CHECK and reconciles", async () => {
    const [n1, n2] = [DAYS14[8], DAYS14[9]];
    await setNight(n1, { allotment: 1 });
    await setNight(n2, { allotment: 1 });
    const stay = {
      checkIn: n1,
      checkOut: DAYS14[10],
      rooms: [{ roomTypeId: f.room.id, ratePlanId: f.ep.id, adults: 2, children: 0 }],
    };
    const q = await pricing.quote(stay);
    if (!q.ok) throw new Error(q.code);
    const guests = await Promise.all(Array.from({ length: 10 }, () => f.newGuest()));
    const cut = admin.setAllotment(
      { mode: "range", roomTypeIds: [f.room.id], from: n1, to: n2, days: ALL, allotment: 0 },
      f.reservations,
    );
    const holds = guests.map((guestId) =>
      booking.acquireHold({ stay, quoteHash: q.quote.quoteHash, guestId }),
    );
    const [admRes, ...holdRes] = await Promise.all([cut, ...holds]);
    if (!admRes.ok) throw new Error(admRes.code);
    const won = holdRes.filter((r) => r.ok).length;
    const applied = admRes.updated === 2;
    // Either the cut landed first (no hold fits) or one hold did (the cut is refused on both nights).
    expect(won).toBe(applied ? 0 : 1);
    expect(admRes.rejected.length).toBe(applied ? 0 : 2);
    for (const r of holdRes) if (!r.ok) expect(r.code).toBe("SOLD_OUT");
    const rows = (await f.inventoryRows()).filter((r) => r.date === n1 || r.date === n2);
    for (const r of rows) {
      expect(r.sold + r.held).toBeLessThanOrEqual(r.allotment);
      expect(r).toMatchObject(applied ? { allotment: 0, held: 0 } : { allotment: 1, held: 1 });
    }
    expect(await reconcileTypes(db, [f.room.id])).toEqual([]);
  });

  it("sales and guests get FORBIDDEN and nothing is written (test 8)", async () => {
    const before = await f.inventoryRows();
    const input = {
      mode: "range" as const,
      roomTypeIds: [f.room.id],
      from: START,
      to: END,
      days: ALL,
      allotment: 0,
    };
    expect(await admin.setAllotment(input, f.sales)).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await admin.setAllotment(input, f.guest)).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await admin.readAllotment({ from: START, to: END }, f.sales)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await f.inventoryRows()).toEqual(before);
  });

  it("refuses dates outside the editable window without writing", async () => {
    const before = await f.inventoryRows();
    const res = await admin.setAllotment(
      {
        mode: "cells",
        cells: [{ roomTypeId: f.room.id, date: addDays(START, -30), allotment: 1 }],
      },
      f.reservations,
    );
    expect(res).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(await f.inventoryRows()).toEqual(before);
  });

  it("readAllotment returns stock per night with total units", async () => {
    await setNight(START, { sold: 1, held: 2 });
    const res = await admin.readAllotment({ from: START, to: DAYS14[1] }, f.reservations);
    if (!res.ok) throw new Error(res.code);
    const mine = res.rows.find((r) => r.roomTypeId === f.room.id);
    expect(mine).toMatchObject({ totalUnits: 8 });
    expect(mine?.nights[START]).toEqual({ allotment: 4, sold: 1, held: 2 });
  });
});
