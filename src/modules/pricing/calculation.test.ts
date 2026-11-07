import { describe, expect, it } from "vitest";
import {
  buildNights,
  calculateQuote,
  MissingTaxSlab,
  nightDiscounts,
  pickGstBp,
} from "./calculation";

const slabs = [
  { minPaise: 0, maxPaise: 750000, gstBp: 500, effectiveFrom: "2025-09-22" },
  { minPaise: 750001, maxPaise: null, gstBp: 1800, effectiveFrom: "2025-09-22" },
];
const stay = { roomTypeId: "r", ratePlanId: "p", checkIn: "2026-11-14", checkOut: "2026-11-16" };

describe("shared pricing calculation", () => {
  it.each([
    [[100, 1000], 600, [100, 500]],
    [[1000, 100], 600, [500, 100]],
    [[1, 2, 1000], 600, [1, 2, 597]],
    [[100, 1000], 2000, [100, 1000]],
    [[10, 10, 10], 5, [2, 2, 1]],
    [[], 600, []],
  ])("redistributes a flat promo for %j (R09)", (rates, value, expected) => {
    expect(nightDiscounts(rates as number[], { kind: "flat", value: value as number })).toEqual(
      expected,
    );
  });

  it("conserves flat discounts over varied rates and never makes a night negative", () => {
    for (let a = 1; a < 20; a++)
      for (let b = 1; b < 20; b++) {
        for (const value of [1, a, a + b - 1, a + b, a + b + 10]) {
          const discount = nightDiscounts([a, b], { kind: "flat", value });
          expect(discount[0] + discount[1]).toBe(Math.min(value, a + b));
          expect(discount[0]).toBeLessThanOrEqual(a);
          expect(discount[1]).toBeLessThanOrEqual(b);
        }
      }
  });

  it("chooses inclusive GST bounds after discount and rounds each night to paise", () => {
    const nights = buildNights(["2026-11-14", "2026-11-15"], [750000, 750001], null, slabs);
    expect(nights.map((n) => n.gstBp)).toEqual([500, 1800]);
    expect(nights.map((n) => n.gstPaise)).toEqual([37500, 135000]);
    const [discounted] = buildNights([stay.checkIn], [820000], { kind: "pct", value: 10 }, slabs);
    expect(discounted).toMatchObject({ discountPaise: 82000, gstBp: 500, gstPaise: 36900 });
    expect(nightDiscounts([101, 105], { kind: "pct", value: 10 })).toEqual([10, 11]);
    expect(nightDiscounts([100], { kind: "pct", value: 150 })).toEqual([100]);
  });

  it("uses the effective schedule for each night irrespective of row order", () => {
    const updated = [
      { minPaise: 0, maxPaise: null, gstBp: 1200, effectiveFrom: "2026-11-15" },
      ...slabs,
    ];
    expect(
      buildNights([stay.checkIn, "2026-11-15"], [10000, 10000], null, updated).map((n) => n.gstBp),
    ).toEqual([500, 1200]);
    expect(() => pickGstBp(100, slabs, "2020-01-01")).toThrow(MissingTaxSlab);
    expect(() =>
      pickGstBp(
        100,
        [...slabs, { minPaise: 1000, maxPaise: null, gstBp: 500, effectiveFrom: "2026-11-15" }],
        "2026-11-15",
      ),
    ).toThrow(MissingTaxSlab);
  });

  it("freezes arithmetic and deterministic hashes, with changes reflected in the hash", () => {
    const quote = () =>
      calculateQuote(
        stay,
        [stay.checkIn, "2026-11-15"],
        [100, 1000],
        { code: "FLAT", kind: "flat", value: 600 },
        slabs,
      );
    const q = quote();
    expect(q).toEqual(quote());
    expect(q).toMatchObject({
      subtotalPaise: 1100,
      discountPaise: 600,
      gstPaise: 25,
      totalPaise: 525,
    });
    expect(
      calculateQuote(stay, [stay.checkIn, "2026-11-15"], [100, 1001], null, slabs).quoteHash,
    ).not.toBe(q.quoteHash);
  });
});
