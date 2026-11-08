import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as dbModule from "@/lib/db";
import * as t from "@/db/schema";
import { addDays } from "@/lib/dates";
import { admin, datesMatching } from "@/modules/admin";
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

const END = DAYS14[DAYS14.length - 1];

describe("A1 setRates (PostgreSQL)", () => {
  it("bulk set writes exactly the weekend cells of the chosen plan, in one statement, with updated_by", async () => {
    const statements: string[] = [];
    const logged = drizzle(client, {
      schema: t,
      logger: { logQuery: (q) => statements.push(q) },
    }) as unknown as dbModule.Db;

    const res = await admin.setRates(
      {
        mode: "range",
        roomTypeIds: [f.room.id],
        planCodes: ["EP"],
        from: START,
        to: END,
        days: [5, 6],
        rupees: 9100,
      },
      f.reservations,
      { db: logged },
    );
    const weekend = datesMatching(START, END, [5, 6]);
    expect(weekend.length).toBe(4);
    expect(res).toEqual({ ok: true, changed: 4 });
    expect(statements.filter((s) => /daily_rates/i.test(s))).toHaveLength(1);
    expect(statements.filter((s) => /^\s*(insert|update|delete)/i.test(s))).toHaveLength(1);

    const rows = await f.rates();
    for (const r of rows) {
      const hit = r.ratePlanId === f.ep.id && weekend.includes(r.date);
      expect(r.pricePaise, `${r.ratePlanId} ${r.date}`).toBe(hit ? 910000 : 500000);
      expect(r.updatedBy).toBe(hit ? f.reservations.userId : null);
    }
  });

  it("counts only prices that actually changed, and creates missing cells inside the horizon", async () => {
    const extra = addDays(END, 1); // no rate row exists yet
    const res = await admin.setRates(
      {
        mode: "cells",
        cells: [
          { roomTypeId: f.room.id, ratePlanId: f.ep.id, date: START, rupees: 5000 }, // same price
          { roomTypeId: f.room.id, ratePlanId: f.cp.id, date: START, rupees: 6200 },
          { roomTypeId: f.room.id, ratePlanId: f.cp.id, date: extra, rupees: 6300 },
        ],
      },
      f.gm,
    );
    expect(res).toEqual({ ok: true, changed: 2 });
    const rows = await f.rates();
    expect(rows.find((r) => r.ratePlanId === f.cp.id && r.date === extra)?.pricePaise).toBe(630000);
  });

  it("ignores a plan that belongs to another room type", async () => {
    const other = await adminFixture(db);
    try {
      const res = await admin.setRates(
        {
          mode: "cells",
          cells: [{ roomTypeId: f.room.id, ratePlanId: other.ep.id, date: START, rupees: 7000 }],
        },
        f.reservations,
      );
      expect(res).toEqual({ ok: true, changed: 0 });
    } finally {
      await other.clean();
    }
  });

  it("rejects past dates and dates past the horizon without writing", async () => {
    const before = await f.rates();
    for (const date of [addDays(START, -40), addDays(START, 400)]) {
      const res = await admin.setRates(
        { mode: "cells", cells: [{ roomTypeId: f.room.id, ratePlanId: f.ep.id, date, rupees: 1 }] },
        f.reservations,
      );
      expect(res).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    }
    expect(await f.rates()).toEqual(before);
  });

  it("a rate edit between quote and hold gives PRICE_CHANGED and takes no stock (mandatory 9 via A1)", async () => {
    const guestId = await f.newGuest();
    const stay = {
      checkIn: DAYS14[2],
      checkOut: DAYS14[4],
      rooms: [{ roomTypeId: f.room.id, ratePlanId: f.ep.id, adults: 2, children: 0 }],
    };
    const q = await pricing.quote(stay);
    if (!q.ok) throw new Error(q.code);
    const edit = await admin.setRates(
      {
        mode: "cells",
        cells: [{ roomTypeId: f.room.id, ratePlanId: f.ep.id, date: DAYS14[3], rupees: 5600 }],
      },
      f.reservations,
    );
    expect(edit).toEqual({ ok: true, changed: 1 });
    const held = await booking.acquireHold({ stay, quoteHash: q.quote.quoteHash, guestId });
    expect(held).toMatchObject({ ok: false, code: "PRICE_CHANGED" });
    if (held.ok || held.code !== "PRICE_CHANGED") return;
    expect(held.quote.lines[0].nights[1].ratePaise).toBe(560000);
    expect((await f.inventoryRows()).every((r) => r.held === 0)).toBe(true);
  });

  it("sales and guests get FORBIDDEN and nothing is written (test 8)", async () => {
    const before = await f.rates();
    const input = {
      mode: "range" as const,
      roomTypeIds: [f.room.id],
      planCodes: ["EP" as const],
      from: START,
      to: END,
      days: [0, 1, 2, 3, 4, 5, 6],
      rupees: 1,
    };
    expect(await admin.setRates(input, f.sales)).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await admin.setRates(input, f.guest)).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await admin.readRates({ from: START, to: END }, f.sales)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await f.rates()).toEqual(before);
  });

  it("readRates returns this room's plans with prices for the range", async () => {
    const res = await admin.readRates({ from: START, to: DAYS14[1] }, f.reservations);
    if (!res.ok) throw new Error(res.code);
    const mine = res.rows.filter((r) => r.roomTypeId === f.room.id);
    expect(mine.map((r) => r.planCode)).toEqual(["EP", "CP"]);
    expect(mine[0].prices).toEqual({ [START]: 500000, [DAYS14[1]]: 500000 });
  });
});

describe("rate rows unchanged elsewhere", () => {
  it("leaves rows of other room types alone", async () => {
    const other = await adminFixture(db);
    try {
      await admin.setRates(
        {
          mode: "range",
          roomTypeIds: [f.room.id],
          planCodes: ["EP", "CP"],
          from: START,
          to: END,
          days: [0, 1, 2, 3, 4, 5, 6],
          rupees: 4321,
        },
        f.reservations,
      );
      const theirs = await db
        .select()
        .from(t.dailyRates)
        .where(eq(t.dailyRates.roomTypeId, other.room.id));
      expect(theirs.every((r) => r.pricePaise === 500000)).toBe(true);
    } finally {
      await other.clean();
    }
  });
});
