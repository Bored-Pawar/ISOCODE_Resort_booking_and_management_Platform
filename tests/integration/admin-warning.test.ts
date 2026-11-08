import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql as dsql } from "drizzle-orm";
import * as dbModule from "@/lib/db";
import { addDays } from "@/lib/dates";
import { admin } from "@/modules/admin";
import { booking } from "@/modules/booking";
import { connect, ensureMigrated, testUrl } from "./helpers";
import { adminFixture, DAYS14 } from "./admin-fixture";

/**
 * Audit M03: the "take offline" warning must list every live booking with a night in the range,
 * whatever else is booked and however long ago the stay began. Rows are inserted directly (one
 * statement each) because 1,000 holds through the service would take minutes on Neon.
 */
const sql = connect();
const { db, client } = dbModule.createDb(testUrl(), { max: 5 });
let f: Awaited<ReturnType<typeof adminFixture>>;
let other: { room: string; plan: string };
let tag: string;

beforeAll(async () => {
  await ensureMigrated(sql);
});
beforeEach(async () => {
  vi.spyOn(dbModule, "getDb").mockReturnValue(db);
  f = await adminFixture(db);
  tag = `W${randomUUID().slice(0, 8)}`;
  const [room] = await db.execute<{ id: string }>(dsql`
    INSERT INTO room_types (slug, name, description, total_units, max_adults, max_children, max_occupancy)
    VALUES (${tag}, 'Other test room', 'test', 1000, 2, 1, 3) RETURNING id`);
  const [plan] = await db.execute<{ id: string }>(dsql`
    INSERT INTO rate_plans (room_type_id, code, name, inclusions)
    VALUES (${room.id}::uuid, 'EP', 'EP', 'none') RETURNING id`);
  other = { room: room.id, plan: plan.id };
});
afterEach(async () => {
  await db.execute(dsql`DELETE FROM bookings WHERE ref LIKE ${tag + "%"}`);
  await db.execute(dsql`DELETE FROM rate_plans WHERE room_type_id = ${other.room}::uuid`);
  await db.execute(dsql`DELETE FROM room_types WHERE id = ${other.room}::uuid`);
  await f?.clean();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await client.end();
  await sql.end();
});

const FROM = DAYS14[2];
const TO = DAYS14[8];

/** Inserts `count` bookings (one room line each) in one statement per table. */
async function insert(opts: {
  prefix: string;
  count: number;
  roomTypeId: string;
  ratePlanId: string;
  checkIn: string;
  checkOut: string;
  status?: "HELD" | "CONFIRMED" | "EXPIRED";
  holdExpires?: "future" | "past";
  createdAt?: string;
}) {
  const guest = await f.newGuest();
  const hold =
    opts.holdExpires === "future"
      ? dsql`now() + interval '1 hour'`
      : opts.holdExpires === "past"
        ? dsql`now() - interval '1 hour'`
        : dsql`NULL`;
  await db.execute(dsql`
    INSERT INTO bookings (ref, guest_id, check_in, check_out, status, hold_expires_at, quote_hash,
      subtotal_paise, gst_paise, total_paise, created_at)
    SELECT ${tag + opts.prefix} || n, ${guest}::uuid, ${opts.checkIn}::date, ${opts.checkOut}::date,
      ${opts.status ?? "CONFIRMED"}, ${hold}, 'h', 100, 0, 100,
      coalesce(${opts.createdAt ?? null}::timestamptz, now()) + make_interval(secs => n)
    FROM generate_series(1, ${opts.count}) AS n`);
  await db.execute(dsql`
    INSERT INTO booking_rooms (booking_id, line_no, room_type_id, rate_plan_id, adults,
      subtotal_paise, gst_paise, total_paise)
    SELECT id, 1, ${opts.roomTypeId}::uuid, ${opts.ratePlanId}::uuid, 2, 100, 0, 100
    FROM bookings WHERE ref LIKE ${tag + opts.prefix + "%"}`);
}

describe("blackout warning lists every overlapping booking (audit M03)", () => {
  it("200 newer bookings elsewhere do not hide an older one; long stays and live holds count", async () => {
    const villa = { roomTypeId: f.room.id, ratePlanId: f.ep.id };
    // The audit's case: one older booking in the chosen room, 200 newer ones in another room.
    await insert({
      prefix: "OLD",
      count: 1,
      ...villa,
      checkIn: DAYS14[3],
      checkOut: DAYS14[5],
      createdAt: "2026-01-01",
    });
    await insert({
      prefix: "NEW",
      count: 200,
      roomTypeId: other.room,
      ratePlanId: other.plan,
      checkIn: DAYS14[4],
      checkOut: DAYS14[6],
      createdAt: new Date().toISOString(),
    });
    // A stay that began 90 days before the range and runs into it.
    await insert({
      prefix: "LONG",
      count: 1,
      ...villa,
      checkIn: addDays(FROM, -90),
      checkOut: addDays(FROM, 1),
      createdAt: "2026-01-02",
    });
    // Live hold counts; lapsed hold, expired booking and a stay ending on FROM do not.
    await insert({
      prefix: "HLIVE",
      count: 1,
      ...villa,
      checkIn: TO,
      checkOut: DAYS14[9],
      status: "HELD",
      holdExpires: "future",
    });
    await insert({
      prefix: "HLAPSED",
      count: 1,
      ...villa,
      checkIn: DAYS14[4],
      checkOut: DAYS14[5],
      status: "HELD",
      holdExpires: "past",
    });
    await insert({
      prefix: "EXP",
      count: 1,
      ...villa,
      checkIn: DAYS14[4],
      checkOut: DAYS14[5],
      status: "EXPIRED",
    });
    await insert({
      prefix: "BEFORE",
      count: 1,
      ...villa,
      checkIn: addDays(FROM, -3),
      checkOut: FROM,
    });
    await insert({
      prefix: "AFTER",
      count: 1,
      ...villa,
      checkIn: addDays(TO, 1),
      checkOut: addDays(TO, 2),
    });

    const res = await admin.bookingsInRange(
      { roomTypeId: f.room.id, from: FROM, to: TO },
      f.reservations,
    );
    if (!res.ok) throw new Error(res.code);
    expect(res.truncated).toBe(false);
    expect(res.bookings.map((b) => b.ref)).toEqual([`${tag}LONG1`, `${tag}OLD1`, `${tag}HLIVE1`]);
    expect(res.bookings.every((b) => b.rooms === 1)).toBe(true);

    // Room filter: the other room sees only its own 200.
    const others = await admin.bookingsInRange(
      { roomTypeId: other.room, from: FROM, to: TO },
      f.gm,
    );
    if (!others.ok) throw new Error(others.code);
    expect(others.bookings).toHaveLength(200);
    expect(others.bookings.every((b) => b.ref.startsWith(`${tag}NEW`))).toBe(true);

    // Paging: small pages return every booking once, ordered by check_in then id.
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await booking.listOverlappingForStaff(
        { roomTypeId: other.room, from: FROM, to: TO, limit: 64, cursor },
        f.reservations,
      );
      if (!page.ok) throw new Error(page.code);
      seen.push(...page.bookings.map((b) => b.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toHaveLength(200);
    expect(new Set(seen).size).toBe(200);
    expect([...seen].sort()).toEqual(seen);
  }, 120_000);

  it("more than 1,000 overlapping bookings: first 1,000 and truncated", async () => {
    await insert({
      prefix: "MANY",
      count: 1001,
      roomTypeId: other.room,
      ratePlanId: other.plan,
      checkIn: DAYS14[4],
      checkOut: DAYS14[5],
    });
    const res = await admin.bookingsInRange(
      { roomTypeId: other.room, from: FROM, to: TO },
      f.reservations,
    );
    expect(res).toMatchObject({ ok: true, truncated: true });
    if (res.ok) expect(res.bookings).toHaveLength(1000);
    const exact = await admin.bookingsInRange(
      { roomTypeId: f.room.id, from: FROM, to: TO },
      f.reservations,
    );
    expect(exact).toEqual({ ok: true, bookings: [], truncated: false });
  }, 120_000);

  it("sales and guests get FORBIDDEN from the booking read", async () => {
    const input = { from: FROM, to: TO };
    for (const who of [f.sales, f.guest])
      expect(await booking.listOverlappingForStaff(input, who)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
    expect(await booking.listOverlappingForStaff({ from: TO, to: FROM }, f.gm)).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
  });
});
