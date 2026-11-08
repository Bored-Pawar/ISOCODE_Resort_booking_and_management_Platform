import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import * as dbModule from "@/lib/db";
import * as t from "@/db/schema";
import { booking } from "@/modules/booking";
import { pricing, type QuoteInput } from "@/modules/pricing";
import { connect, ensureMigrated, testUrl } from "./helpers";
import { bookingsOfType, coreFixture, reconcileTypes, testSlabs } from "./core-fixture";

const sql = connect();
const { db, client } = dbModule.createDb(testUrl(), { max: 12 });
let f: Awaited<ReturnType<typeof coreFixture>>;
let cleanSlabs: Awaited<ReturnType<typeof testSlabs>>;
const extraGuests: string[] = [];

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
    if (f) expect(await reconcileTypes(db, [f.room.id])).toHaveLength(0);
  } finally {
    await f?.clean();
    if (extraGuests.length) {
      await db.delete(t.users).where(eq(t.users.id, extraGuests.pop()!));
    }
    vi.restoreAllMocks();
  }
});
afterAll(async () => {
  await cleanSlabs?.();
  await client.end();
  await sql.end();
});

async function allot(n: number) {
  await db.update(t.inventory).set({ allotment: n }).where(eq(t.inventory.roomTypeId, f.room.id));
}
async function hashOf(stay: QuoteInput) {
  const q = await pricing.quote(stay);
  if (!q.ok) throw new Error(q.code);
  return q.quote.quoteHash;
}
async function held() {
  const rows = await db
    .select({ held: t.inventory.held })
    .from(t.inventory)
    .where(eq(t.inventory.roomTypeId, f.room.id))
    .orderBy(asc(t.inventory.date));
  return rows.map((r) => r.held);
}
async function holdsOfType() {
  return (await bookingsOfType(db, f.room.id)).filter((b) => b.status === "HELD");
}
async function otherGuest() {
  const [g] = await db
    .insert(t.users)
    .values({
      email: `${randomUUID()}@test.example`,
      name: "Other",
      passwordHash: "unused",
      role: "guest",
    })
    .returning();
  extraGuests.push(g.id);
  return g.id;
}

describe("acquireHold is idempotent per guest and exact stay", () => {
  it("a: 5 parallel holds, same guest, same cart, stock for 5: one booking, held +1", async () => {
    await allot(5);
    const quoteHash = await hashOf(f.stay);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        booking.acquireHold({ stay: f.stay, quoteHash, guestId: f.guest.id }),
      ),
    );
    const ids = results.map((r) => (r.ok ? r.booking.id : r.code));
    expect(new Set(ids).size).toBe(1);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await holdsOfType()).toHaveLength(1);
    expect(await held()).toEqual([1, 1]);
    const events = await db
      .select()
      .from(t.bookingEvents)
      .where(eq(t.bookingEvents.bookingId, ids[0]));
    expect(events).toHaveLength(1);
  });

  it("b: same rooms and dates with a different adults/children split is a separate hold", async () => {
    await allot(2);
    const two = f.stayWith({ adults: 2, children: 0 });
    const split = f.stayWith({ adults: 1, children: 1 });
    const h1 = await hashOf(two);
    const h2 = await hashOf(split);
    expect(h1).toBe(h2); // quoteHash excludes occupancy, so the lines must be compared
    const a = await booking.acquireHold({ stay: two, quoteHash: h1, guestId: f.guest.id });
    const b = await booking.acquireHold({ stay: split, quoteHash: h2, guestId: f.guest.id });
    expect(a.ok && b.ok && a.booking.id !== b.booking.id).toBe(true);
    expect(await held()).toEqual([2, 2]);
  });

  it("c: two different guests with the same cart get two holds", async () => {
    await allot(2);
    const other = await otherGuest();
    const quoteHash = await hashOf(f.stay);
    const [a, b] = await Promise.all([
      booking.acquireHold({ stay: f.stay, quoteHash, guestId: f.guest.id }),
      booking.acquireHold({ stay: f.stay, quoteHash, guestId: other }),
    ]);
    expect(a.ok && b.ok && a.booking.id !== b.booking.id).toBe(true);
    expect(await holdsOfType()).toHaveLength(2);
    expect(await held()).toEqual([2, 2]);
  });

  it("d: an expired matching hold is not reused; a new hold is taken", async () => {
    const quoteHash = await hashOf(f.stay);
    const first = await booking.acquireHold({ stay: f.stay, quoteHash, guestId: f.guest.id });
    if (!first.ok) throw new Error(first.code);
    await db
      .update(t.bookings)
      .set({ holdExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(t.bookings.id, first.booking.id));
    const second = await booking.acquireHold({ stay: f.stay, quoteHash, guestId: f.guest.id });
    expect(second.ok && second.booking.id !== first.booking.id).toBe(true);
    const [old] = await db
      .select({ s: t.bookings.status })
      .from(t.bookings)
      .where(eq(t.bookings.id, first.booking.id));
    expect(old.s).toBe("EXPIRED");
    expect(await held()).toEqual([1, 1]);
  });
});
