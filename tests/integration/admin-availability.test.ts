import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, or } from "drizzle-orm";
import * as dbModule from "@/lib/db";
import * as t from "@/db/schema";
import { admin } from "@/modules/admin";
import { booking } from "@/modules/booking";
import { pricing } from "@/modules/pricing";
import { connect, ensureMigrated, testUrl } from "./helpers";
import { adminFixture, DAYS14 } from "./admin-fixture";

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

const stayOn = (checkIn: string, checkOut: string) => ({
  checkIn,
  checkOut,
  rooms: [{ roomTypeId: f.room.id, ratePlanId: f.ep.id, adults: 2, children: 0 }],
});
async function hold(checkIn: string, checkOut: string) {
  const stay = stayOn(checkIn, checkOut);
  const q = await pricing.quote(stay);
  if (!q.ok) throw new Error(q.code);
  return booking.acquireHold({ stay, quoteHash: q.quote.quoteHash, guestId: await f.newGuest() });
}
const mine = () =>
  db
    .select()
    .from(t.blackoutDates)
    .where(eq(t.blackoutDates.roomTypeId, f.room.id))
    .orderBy(t.blackoutDates.startDate);

describe("A3 online / offline (PostgreSQL)", () => {
  it("offline blocks a new hold (BLACKOUT), the existing booking stands, online allows it again (test 6)", async () => {
    const existing = await hold(DAYS14[3], DAYS14[5]);
    if (!existing.ok) throw new Error(existing.code);
    const stockBefore = await f.inventoryRows();

    const warn = await admin.bookingsInRange(
      { roomTypeId: f.room.id, from: DAYS14[2], to: DAYS14[6] },
      f.reservations,
    );
    expect(warn).toMatchObject({ ok: true, bookings: [{ ref: existing.booking.ref, rooms: 1 }] });

    const off = await admin.setOffline(
      { roomTypeId: f.room.id, from: DAYS14[2], to: DAYS14[6], reason: "Roof repair" },
      f.reservations,
    );
    expect(off).toMatchObject({
      ok: true,
      merged: 0,
      blackout: { startDate: DAYS14[2], endDate: DAYS14[6], reason: "Roof repair" },
    });
    const [row] = await mine();
    expect(row.createdBy).toBe(f.reservations.userId);

    expect(await hold(DAYS14[4], DAYS14[7])).toMatchObject({ ok: false, code: "BLACKOUT" });
    const kept = await db.select().from(t.bookings).where(eq(t.bookings.id, existing.booking.id));
    expect(kept[0].status).toBe("HELD");
    expect(await f.inventoryRows()).toEqual(stockBefore);
    const avail = await (
      await import("@/modules/inventory")
    ).inventory.availability({ roomTypeId: f.room.id, checkIn: DAYS14[4], checkOut: DAYS14[5] });
    expect(avail).toMatchObject({ ok: true, rooms: [{ blackedOut: true, soldOut: true }] });

    const on = await admin.setOnline(
      { roomTypeId: f.room.id, from: DAYS14[2], to: DAYS14[6] },
      f.gm,
    );
    expect(on).toEqual({ ok: true, removed: 1, trimmed: 0, split: 0 });
    expect(await hold(DAYS14[4], DAYS14[7])).toMatchObject({ ok: true });
  }, 120000);

  it("merges overlapping and touching ranges of the same scope and keeps both reasons", async () => {
    await admin.setOffline(
      { roomTypeId: f.room.id, from: DAYS14[0], to: DAYS14[2], reason: "Painting" },
      f.reservations,
    );
    const res = await admin.setOffline(
      { roomTypeId: f.room.id, from: DAYS14[3], to: DAYS14[5], reason: "Plumbing" },
      f.reservations,
    );
    expect(res).toMatchObject({ ok: true, merged: 1 });
    const rows = await mine();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      startDate: DAYS14[0],
      endDate: DAYS14[5],
      reason: "Painting; Plumbing",
    });
  });

  it("bringing the middle online splits a blackout; an edge trims it", async () => {
    await admin.setOffline(
      { roomTypeId: f.room.id, from: DAYS14[0], to: DAYS14[9], reason: "Works" },
      f.reservations,
    );
    expect(
      await admin.setOnline(
        { roomTypeId: f.room.id, from: DAYS14[3], to: DAYS14[4] },
        f.reservations,
      ),
    ).toEqual({ ok: true, removed: 0, trimmed: 0, split: 1 });
    expect((await mine()).map((b) => [b.startDate, b.endDate, b.reason])).toEqual([
      [DAYS14[0], DAYS14[2], "Works"],
      [DAYS14[5], DAYS14[9], "Works"],
    ]);
    expect(
      await admin.setOnline(
        { roomTypeId: f.room.id, from: DAYS14[8], to: DAYS14[12] },
        f.reservations,
      ),
    ).toEqual({ ok: true, removed: 0, trimmed: 1, split: 0 });
    expect((await mine()).map((b) => [b.startDate, b.endDate])).toEqual([
      [DAYS14[0], DAYS14[2]],
      [DAYS14[5], DAYS14[7]],
    ]);
  });

  it("a room inside an all-rooms blackout is refused and nothing changes", async () => {
    const all = await admin.setOffline(
      { roomTypeId: null, from: DAYS14[10], to: DAYS14[11], reason: "Estate event" },
      f.gm,
    );
    if (!all.ok) throw new Error(all.code);
    f.trackBlackouts([all.blackout.id]);
    expect(await hold(DAYS14[10], DAYS14[11])).toMatchObject({ ok: false, code: "BLACKOUT" });
    const res = await admin.setOnline(
      { roomTypeId: f.room.id, from: DAYS14[10], to: DAYS14[11] },
      f.reservations,
    );
    expect(res).toMatchObject({ ok: false, code: "ALL_ROOMS_OFFLINE" });
    const still = await db
      .select()
      .from(t.blackoutDates)
      .where(or(eq(t.blackoutDates.id, all.blackout.id)));
    expect(still).toHaveLength(1);
    expect(
      await admin.setOnline({ roomTypeId: null, from: DAYS14[10], to: DAYS14[11] }, f.gm),
    ).toEqual({ ok: true, removed: 1, trimmed: 0, split: 0 });
  });

  it("requires a reason and stays inside the window", async () => {
    expect(
      await admin.setOffline(
        { roomTypeId: f.room.id, from: DAYS14[0], to: DAYS14[1], reason: " " },
        f.reservations,
      ),
    ).toMatchObject({ ok: false, code: "INVALID_INPUT", errors: { reason: expect.any(String) } });
    expect(
      await admin.setOffline(
        { roomTypeId: f.room.id, from: "2020-01-01", to: "2020-01-02", reason: "Old" },
        f.reservations,
      ),
    ).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(await mine()).toEqual([]);
  });

  it("sales and guests get FORBIDDEN and nothing is written (test 8)", async () => {
    const input = { roomTypeId: f.room.id, from: DAYS14[0], to: DAYS14[1], reason: "Nope" };
    for (const who of [f.sales, f.guest]) {
      expect(await admin.setOffline(input, who)).toEqual({ ok: false, code: "FORBIDDEN" });
      expect(await admin.setOnline(input, who)).toEqual({ ok: false, code: "FORBIDDEN" });
      expect(await admin.bookingsInRange(input, who)).toEqual({ ok: false, code: "FORBIDDEN" });
    }
    expect(await mine()).toEqual([]);
  });
});
