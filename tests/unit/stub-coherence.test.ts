import { describe, expect, it } from "vitest";
import { computeQuoteHash, pricing } from "@/modules/pricing";
import { booking } from "@/modules/booking";
import { nightsBetween } from "@/lib/dates";

const alt = [
  {
    roomTypeId: "rt-estate-suite",
    ratePlanId: "rp-suite-map",
    checkIn: "2026-12-24",
    checkOut: "2026-12-29",
    adults: 2,
  },
  {
    roomTypeId: "rt-pool-villa",
    ratePlanId: "rp-pool-ep",
    checkIn: "2027-01-02",
    checkOut: "2027-01-03",
    adults: 2,
    children: 1,
    promoCode: "welcome10",
  },
  {
    roomTypeId: "rt-plantation-room",
    ratePlanId: "rp-plantation-cp",
    checkIn: "2026-11-30",
    checkOut: "2026-12-02",
    adults: 1,
  },
];

describe("stub pricing is coherent for any valid stay (R05)", () => {
  it.each(alt)(
    "quote matches its own stay, totals and hash: $roomTypeId $checkIn",
    async (stay) => {
      const r = await pricing.quote(stay);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const q = r.quote;
      expect(q.roomTypeId).toBe(stay.roomTypeId);
      expect(q.ratePlanId).toBe(stay.ratePlanId);
      expect(q.nights).toHaveLength(nightsBetween(stay.checkIn, stay.checkOut));
      expect(q.nights[0].date).toBe(stay.checkIn);
      expect(q.nights.at(-1)!.date < stay.checkOut).toBe(true);
      expect(q.subtotalPaise).toBe(q.nights.reduce((s, n) => s + n.ratePaise, 0));
      expect(q.discountPaise).toBe(q.nights.reduce((s, n) => s + n.discountPaise, 0));
      expect(q.gstPaise).toBe(q.nights.reduce((s, n) => s + n.gstPaise, 0));
      expect(q.totalPaise).toBe(q.subtotalPaise - q.discountPaise + q.gstPaise);
      expect(computeQuoteHash(q)).toBe(q.quoteHash);
    },
  );

  it("different stays and rooms give different hashes; same stay is stable", async () => {
    const [a, b] = await Promise.all([pricing.quote(alt[0]), pricing.quote(alt[2])]);
    const a2 = await pricing.quote(alt[0]);
    expect(a.ok && b.ok && a2.ok).toBe(true);
    if (a.ok && b.ok && a2.ok) {
      expect(a.quote.quoteHash).not.toBe(b.quote.quoteHash);
      expect(a.quote.quoteHash).toBe(a2.quote.quoteHash);
    }
  });

  it("promo is applied to every night; unknown promo, plan, room and occupancy are typed errors", async () => {
    const withPromo = await pricing.quote(alt[1]);
    expect(withPromo.ok && withPromo.quote.promo?.code).toBe("WELCOME10");
    expect(withPromo.ok && withPromo.quote.discountPaise).toBeGreaterThan(0);
    expect(await pricing.quote({ ...alt[0], promoCode: "NOPE" })).toEqual({
      ok: false,
      code: "PROMO_INVALID",
    });
    expect(await pricing.quote({ ...alt[0], ratePlanId: "rp-pool-ep" })).toEqual({
      ok: false,
      code: "NO_RATE",
    });
    expect(await pricing.quote({ ...alt[0], roomTypeId: "rt-nope" })).toEqual({
      ok: false,
      code: "NO_RATE",
    });
    expect(await pricing.quote({ ...alt[0], adults: 9 })).toEqual({
      ok: false,
      code: "OVER_OCCUPANCY",
    });
  });
});

describe("stub hold is coherent with the requested stay (R05) and carries quote failures (R02)", () => {
  const guestId = "user-guest-asha";

  it.each(alt)("hold echoes the stay and the quoted price: $roomTypeId", async (stay) => {
    const priced = await pricing.quote(stay);
    if (!priced.ok) throw new Error("stub quote failed");
    const r = await booking.acquireHold({ stay, quoteHash: priced.quote.quoteHash, guestId });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const b = r.booking;
    expect([b.roomTypeId, b.ratePlanId, b.checkIn, b.checkOut]).toEqual([
      stay.roomTypeId,
      stay.ratePlanId,
      stay.checkIn,
      stay.checkOut,
    ]);
    expect(b.guestId).toBe(guestId);
    expect(b.adults).toBe(stay.adults);
    expect(b.totalPaise).toBe(priced.quote.totalPaise);
    expect(b.nights).toEqual(priced.quote.nights);
    expect(b.quoteHash).toBe(priced.quote.quoteHash);
    expect(b.status).toBe("HELD");
  });

  it("a stale hash returns PRICE_CHANGED with the fresh quote for that stay", async () => {
    const r = await booking.acquireHold({ stay: alt[0], quoteHash: "stale", guestId });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "PRICE_CHANGED") {
      const fresh = await pricing.quote(alt[0]);
      expect(fresh.ok && r.quote.quoteHash === fresh.quote.quoteHash).toBe(true);
    } else throw new Error("expected PRICE_CHANGED");
  });

  it("returns PROMO_INVALID, OVER_OCCUPANCY, NO_RATE and INVALID_INPUT", async () => {
    const hold = (stay: object) =>
      booking.acquireHold({ stay: stay as (typeof alt)[0], quoteHash: "x", guestId });
    expect(await hold({ ...alt[0], promoCode: "EXPIRED10" })).toEqual({
      ok: false,
      code: "PROMO_INVALID",
    });
    expect(await hold({ ...alt[0], adults: 9 })).toEqual({ ok: false, code: "OVER_OCCUPANCY" });
    expect(await hold({ ...alt[0], roomTypeId: "rt-nope" })).toEqual({
      ok: false,
      code: "NO_RATE",
    });
    expect(await hold({ ...alt[0], checkOut: alt[0].checkIn })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
  });
});

describe("transaction helpers are internal stubs (R01)", () => {
  it("are not part of the public module contracts", async () => {
    const [p, i] = await Promise.all([import("@/modules/pricing"), import("@/modules/inventory")]);
    expect(Object.keys(p)).not.toContain("quoteInTx");
    expect(Object.keys(i)).not.toContain("lockNights");
    expect(Object.keys(i)).not.toContain("adjustNights");
  });
  it("throw until implemented, and booking exposes the cron/lazy-expiry entry", async () => {
    const internal = await import("@/modules/inventory/internal");
    await expect(
      internal.lockNights({} as never, {
        roomTypeId: "x",
        checkIn: "2026-12-01",
        checkOut: "2026-12-02",
        units: 1,
      }),
    ).rejects.toThrow("not implemented");
    expect(await booking.releaseExpiredHolds()).toEqual({ ok: true, released: 0 });
  });
});
