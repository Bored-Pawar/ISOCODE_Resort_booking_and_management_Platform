import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as dbModule from "@/lib/db";
import * as schema from "@/db/schema";
import * as t from "@/db/schema";
import { booking } from "@/modules/booking";
import { connect, ensureMigrated, testUrl } from "./helpers";
import { coreFixture, dates } from "./core-fixture";

const sql = connect();
const { db, client } = dbModule.createDb(testUrl(), { max: 4 });
let f: Awaited<ReturnType<typeof coreFixture>>;

// A second client that records every statement it sends.
const sent: string[] = [];
const counting = postgres(testUrl(), {
  prepare: false,
  max: 2,
  onnotice: () => {},
  debug: (_connection, query) => sent.push(query),
});
const countingDb = drizzle(counting, { schema });
const isData = (q: string) => !/^\s*(begin|commit|rollback|savepoint|release)\b/i.test(q);

beforeAll(async () => {
  await ensureMigrated(sql);
});
beforeEach(async () => {
  f = await coreFixture(db);
});
afterEach(async () => {
  await f?.clean();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await counting.end();
  await client.end();
  await sql.end();
});

const ref = () => `CA-${randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase()}`;

describe("listForGuest query depth (S2 review M2)", () => {
  it("f: 30 bookings are read with at most 4 data queries, owner only", async () => {
    const promo = await f.promo();
    const rows = Array.from({ length: 30 }, (_, i) => ({
      ref: ref(),
      guestId: f.guest.id,
      checkIn: dates[0],
      checkOut: f.stay.checkOut,
      status: i % 3 === 0 ? "CANCELLED" : "EXPIRED",
      quoteHash: `h${i}`,
      promoId: i % 2 === 0 ? promo.id : null,
      subtotalPaise: 1000,
      discountPaise: 0,
      gstPaise: 50,
      totalPaise: 1050,
    }));
    const inserted = await db.insert(t.bookings).values(rows).returning({ id: t.bookings.id });
    const lines = await db
      .insert(t.bookingRooms)
      .values(
        inserted.map((b) => ({
          bookingId: b.id,
          lineNo: 1,
          roomTypeId: f.room.id,
          ratePlanId: f.plan.id,
          adults: 2,
          children: 0,
          subtotalPaise: 1000,
          gstPaise: 50,
          totalPaise: 1050,
        })),
      )
      .returning({ id: t.bookingRooms.id });
    await db.insert(t.bookingNights).values(
      lines.flatMap((l) =>
        dates.map((date) => ({
          bookingRoomId: l.id,
          date,
          ratePaise: 500,
          discountPaise: 0,
          gstBp: 500,
          gstPaise: 25,
        })),
      ),
    );

    vi.spyOn(dbModule, "getDb").mockReturnValue(countingDb as unknown as dbModule.Db);
    sent.length = 0;
    const result = await booking.listForGuest({ guestId: f.guest.id, limit: 50 });
    const data = sent.filter(isData);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bookings).toHaveLength(30);
    expect(result.bookings.every((b) => b.guestId === f.guest.id)).toBe(true);
    expect(
      result.bookings.every((b) => b.rooms.length === 1 && b.rooms[0].nights.length === 2),
    ).toBe(true);
    expect(result.bookings.filter((b) => b.promoCode === promo.code)).toHaveLength(15);
    expect(data.length).toBeLessThanOrEqual(4);
    // Every data query carries the owner predicate (guest_id) except the promo code lookup.
    for (const q of data.filter((q) => !/promo_codes/.test(q))) expect(q).toMatch(/guest_id/);
  });
});
