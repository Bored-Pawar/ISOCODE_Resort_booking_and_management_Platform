import { describe, expect, it } from "vitest";
import { computeQuoteHash, pricing } from "@/modules/pricing";
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
