import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as dbModule from "@/lib/db";
import * as t from "@/db/schema";
import { booking, type BookingActor } from "@/modules/booking";
import { pricing } from "@/modules/pricing";
import { connect, ensureMigrated, testUrl } from "./helpers";
import { checkIn, coreFixture, testSlabs } from "./core-fixture";

const sql = connect();
const { db, client } = dbModule.createDb(testUrl(), { max: 6 });
let f: Awaited<ReturnType<typeof coreFixture>>;
let cleanSlabs: Awaited<ReturnType<typeof testSlabs>>;
const staff: BookingActor = { userId: randomUUID(), role: "reservations" };

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

describe("staff booking reads (A5)", () => {
  it("are refused to guests and sales", async () => {
    for (const role of ["guest", "sales"] as const) {
      const actor = { userId: f.guest.id, role };
      expect(await booking.listForStaff({}, actor)).toEqual({ ok: false, code: "FORBIDDEN" });
      expect(await booking.getForStaff({ ref: "CA-XXXXX" }, actor)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(await booking.listRefundPending({}, actor)).toEqual({ ok: false, code: "FORBIDDEN" });
    }
  });

  it("filter by status and check-in range, and show the timeline and a late payment", async () => {
    const b = await hold();
    const held = await booking.listForStaff(
      { status: "HELD", checkInFrom: checkIn, checkInTo: checkIn, limit: 200 },
      staff,
    );
    expect(held.ok && held.bookings.some((x) => x.id === b.id)).toBe(true);
    const other = await booking.listForStaff({ status: "CONFIRMED", checkInFrom: checkIn }, staff);
    expect(other.ok && other.bookings.some((x) => x.id === b.id)).toBe(false);
    expect(
      (await booking.listForStaff({ checkInFrom: "2099-12-01", checkInTo: "2099-11-01" }, staff))
        .ok,
    ).toBe(false);

    // Expire it, then pay: REFUND_PENDING, listed for staff.
    await db
      .update(t.bookings)
      .set({ holdExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(t.bookings.id, b.id));
    const late = await booking.confirmPayment({
      bookingId: b.id,
      provider: "mock",
      providerPaymentId: `mock_${b.id}_${randomUUID()}`,
      amountPaise: b.totalPaise,
    });
    expect(late).toMatchObject({ ok: true, outcome: "REFUND_PENDING" });

    const detail = await booking.getForStaff({ ref: b.ref }, { ...staff, role: "gm" });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.booking.status).toBe("EXPIRED");
    expect(detail.events.map((e) => e.toStatus)).toEqual(["HELD", "EXPIRED", "EXPIRED"]);
    expect(detail.payments).toHaveLength(1);
    expect(detail.payments[0].status).toBe("REFUND_PENDING");

    const refunds = await booking.listRefundPending({ limit: 200 }, staff);
    expect(
      refunds.ok && refunds.payments.some((p) => p.bookingId === b.id && p.ref === b.ref),
    ).toBe(true);
    expect(await booking.getForStaff({ ref: "CA-NONE0" }, staff)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });
});
