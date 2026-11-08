/**
 * booking.listForGuest (additive read for "My bookings"): only the guest's own bookings, every
 * status, newest stay first, with the frozen room lines. Never writes.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as dbModule from "@/lib/db";
import * as t from "@/db/schema";
import { booking } from "@/modules/booking";
import { pricing, type QuoteInput } from "@/modules/pricing";
import { connect, ensureMigrated, testUrl } from "./helpers";
import { coreFixture, testSlabs } from "./core-fixture";

const sql = connect();
const { db, client } = dbModule.createDb(testUrl(), { max: 4 });
let A: Awaited<ReturnType<typeof coreFixture>>;
let B: Awaited<ReturnType<typeof coreFixture>>;
let cleanSlabs: Awaited<ReturnType<typeof testSlabs>>;

beforeAll(async () => {
  await ensureMigrated(sql);
  cleanSlabs = await testSlabs(db);
});
beforeEach(async () => {
  vi.spyOn(dbModule, "getDb").mockReturnValue(db);
  A = await coreFixture(db);
  B = await coreFixture(db);
});
afterEach(async () => {
  try {
    // B first: guest A also holds a booking of B's room type, which B.clean removes.
    await B?.clean();
    await A?.clean();
  } finally {
    vi.restoreAllMocks();
  }
});
afterAll(async () => {
  await cleanSlabs?.();
  await client.end();
  await sql.end();
});

async function holdFor(guestId: string, stay: QuoteInput) {
  const q = await pricing.quote(stay);
  if (!q.ok) throw new Error(q.code);
  const r = await booking.acquireHold({ stay, quoteHash: q.quote.quoteHash, guestId });
  if (!r.ok) throw new Error(r.code);
  return r.booking;
}

describe("booking.listForGuest", () => {
  it("lists only the guest's bookings, every status, newest first, with room lines", async () => {
    const first = await holdFor(A.guest.id, A.stay);
    const second = await holdFor(A.guest.id, B.stay);
    await db.update(t.bookings).set({ status: "EXPIRED" }).where(eq(t.bookings.id, first.id));
    // Same stay dates: the later booking comes first.
    await db
      .update(t.bookings)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(t.bookings.id, first.id));

    const before = await db.select().from(t.bookings).where(eq(t.bookings.guestId, A.guest.id));
    const r = await booking.listForGuest({ guestId: A.guest.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bookings.map((b) => b.ref)).toEqual([second.ref, first.ref]);
    expect(r.bookings.map((b) => b.status)).toEqual(["HELD", "EXPIRED"]);
    expect(r.bookings[0].rooms).toHaveLength(1);
    expect(r.bookings[0].rooms[0].roomTypeId).toBe(B.room.id);
    expect(r.bookings[0].totalPaise).toBe(second.totalPaise);
    expect(r.bookings.every((b) => b.guestId === A.guest.id)).toBe(true);
    // Read only: nothing changed.
    expect(await db.select().from(t.bookings).where(eq(t.bookings.guestId, A.guest.id))).toEqual(
      before,
    );

    expect(await booking.listForGuest({ guestId: B.guest.id })).toEqual({ ok: true, bookings: [] });
  });

  it("honours the limit and accepts an upper-case UUID", async () => {
    await holdFor(A.guest.id, A.stay);
    await holdFor(A.guest.id, B.stay);
    const r = await booking.listForGuest({ guestId: A.guest.id.toUpperCase(), limit: 1 });
    expect(r.ok && r.bookings).toHaveLength(1);
  });

  it("rejects input that is not a guest UUID", async () => {
    for (const guestId of ["", "not-a-uuid", "1 OR 1=1"]) {
      expect(await booking.listForGuest({ guestId })).toEqual({ ok: false, code: "INVALID_INPUT" });
    }
    expect(await booking.listForGuest({ guestId: A.guest.id, limit: 0 })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
  });
});
