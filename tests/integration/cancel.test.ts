import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import * as dbModule from "@/lib/db";
import * as t from "@/db/schema";
import { booking, type BookingActor } from "@/modules/booking";
import { pricing } from "@/modules/pricing";
import { connect, ensureMigrated, testUrl } from "./helpers";
import { coreFixture, reconcileTypes, testSlabs } from "./core-fixture";

const sql = connect();
const { db, client } = dbModule.createDb(testUrl(), { max: 12 });
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
  try {
    if (f) expect(await reconcileTypes(db, [f.room.id])).toHaveLength(0);
  } finally {
    await f?.clean();
    vi.restoreAllMocks();
  }
});
afterAll(async () => {
  await cleanSlabs?.();
  await client.end();
  await sql.end();
});

const owner = (): BookingActor => ({ userId: f.guest.id, role: "guest" });

async function hold() {
  const q = await pricing.quote(f.stay);
  if (!q.ok) throw new Error(q.code);
  const r = await booking.acquireHold({
    stay: f.stay,
    quoteHash: q.quote.quoteHash,
    guestId: f.guest.id,
  });
  if (!r.ok) throw new Error(r.code);
  return r.booking;
}
async function held() {
  const rows = await db
    .select({ held: t.inventory.held, sold: t.inventory.sold })
    .from(t.inventory)
    .where(eq(t.inventory.roomTypeId, f.room.id))
    .orderBy(asc(t.inventory.date));
  return rows;
}
async function status(id: string) {
  const [b] = await db
    .select({ s: t.bookings.status })
    .from(t.bookings)
    .where(eq(t.bookings.id, id));
  return b.s;
}
async function expireNow(id: string) {
  await db
    .update(t.bookings)
    .set({ holdExpiresAt: new Date(Date.now() - 1000) })
    .where(eq(t.bookings.id, id));
}
function pay(b: { id: string; totalPaise: number }) {
  return booking.confirmPayment({
    bookingId: b.id,
    provider: "mock",
    providerPaymentId: randomUUID(),
    amountPaise: b.totalPaise,
  });
}

describe("booking.cancelHeld", () => {
  it("releases the held stock once and writes an event; a second cancel is NOT_HELD", async () => {
    const b = await hold();
    expect((await held()).every((n) => n.held === 1)).toBe(true);
    const first = await booking.cancelHeld({ bookingId: b.id }, owner());
    expect(first.ok && first.booking.status).toBe("CANCELLED");
    expect((await held()).every((n) => n.held === 0 && n.sold === 0)).toBe(true);
    const again = await booking.cancelHeld({ bookingId: b.id }, owner());
    expect(again).toMatchObject({ ok: false, code: "NOT_HELD", status: "CANCELLED" });
    expect((await held()).every((n) => n.held === 0)).toBe(true);
    const events = await db
      .select()
      .from(t.bookingEvents)
      .where(eq(t.bookingEvents.bookingId, b.id));
    expect(events.filter((e) => e.toStatus === "CANCELLED")).toHaveLength(1);
  });

  it("cancel versus expiry of an elapsed hold releases once and ends EXPIRED", async () => {
    const b = await hold();
    await expireNow(b.id);
    const [cancel] = await Promise.all([
      booking.cancelHeld({ bookingId: b.id }, owner()),
      booking.releaseExpiredHolds(),
    ]);
    expect(cancel).toMatchObject({ ok: false, code: "NOT_HELD", status: "EXPIRED" });
    expect(await status(b.id)).toBe("EXPIRED");
    expect((await held()).every((n) => n.held === 0)).toBe(true);
  });

  it("cancel versus the expiry sweep on a live hold cancels and releases once", async () => {
    const b = await hold();
    const results = await Promise.all([
      booking.cancelHeld({ bookingId: b.id }, owner()),
      booking.releaseExpiredHolds(),
      booking.releaseExpiredHolds(),
    ]);
    expect(results[0].ok).toBe(true);
    expect(await status(b.id)).toBe("CANCELLED");
    expect((await held()).every((n) => n.held === 0)).toBe(true);
  });

  it("cancel versus confirm ends in exactly one terminal state with stock reconciled", async () => {
    const b = await hold();
    const [cancel, paid] = await Promise.all([
      booking.cancelHeld({ bookingId: b.id }, owner()),
      pay(b),
    ]);
    const final = await status(b.id);
    expect(["CANCELLED", "CONFIRMED"]).toContain(final);
    if (final === "CANCELLED") {
      expect(cancel.ok).toBe(true);
      expect(paid).toMatchObject({ ok: true, outcome: "REFUND_PENDING" });
      expect((await held()).every((n) => n.held === 0 && n.sold === 0)).toBe(true);
    } else {
      expect(cancel).toMatchObject({ ok: false, code: "NOT_HELD", status: "CONFIRMED" });
      expect(paid).toMatchObject({ ok: true, outcome: "CONFIRMED" });
      expect((await held()).every((n) => n.held === 0 && n.sold === 1)).toBe(true);
    }
    // afterEach reconciles held and sold against booking lines either way.
  }, 90_000);

  it("refuses anyone but the owning guest", async () => {
    const b = await hold();
    const [other] = await db
      .insert(t.users)
      .values({
        email: `${randomUUID()}@test.example`,
        name: "Other",
        passwordHash: "unused",
        role: "guest",
      })
      .returning();
    try {
      expect(
        await booking.cancelHeld({ bookingId: b.id }, { userId: other.id, role: "guest" }),
      ).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(
        await booking.cancelHeld({ bookingId: b.id }, { userId: f.guest.id, role: "reservations" }),
      ).toEqual({ ok: false, code: "FORBIDDEN" });
      expect(await status(b.id)).toBe("HELD");
      expect((await held()).every((n) => n.held === 1)).toBe(true);
    } finally {
      await booking.cancelHeld({ bookingId: b.id }, owner());
      await db.delete(t.users).where(eq(t.users.id, other.id));
    }
  });

  it("returns NOT_HELD for a confirmed booking and NOT_FOUND / INVALID_INPUT for bad ids", async () => {
    const b = await hold();
    expect(await pay(b)).toMatchObject({ ok: true, outcome: "CONFIRMED" });
    expect(await booking.cancelHeld({ bookingId: b.id }, owner())).toMatchObject({
      ok: false,
      code: "NOT_HELD",
      status: "CONFIRMED",
    });
    expect((await held()).every((n) => n.sold === 1 && n.held === 0)).toBe(true);
    expect(await booking.cancelHeld({ bookingId: randomUUID() }, owner())).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await booking.cancelHeld({ bookingId: "nope" }, owner())).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
  });
});
