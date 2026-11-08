import { describe, expect, it } from "vitest";
import {
  buildNights,
  calculateQuote,
  MissingTaxSlab,
  nightDiscounts,
  pickGstBp,
  type LineInput,
} from "./calculation";

const slabs = [
  { minPaise: 0, maxPaise: 750000, gstBp: 500, effectiveFrom: "2025-09-22" },
  { minPaise: 750001, maxPaise: null, gstBp: 1800, effectiveFrom: "2025-09-22" },
];
const stay = { checkIn: "2026-11-14", checkOut: "2026-11-16" };
const twoNights = [stay.checkIn, "2026-11-15"];
const line = (rates: number[], over: Partial<LineInput> = {}): LineInput => ({
  roomTypeId: "r",
  ratePlanId: "p",
  adults: 2,
  children: 0,
  rates,
  ...over,
});

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
    const nights = buildNights(twoNights, [750000, 750001], null, slabs);
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
    expect(buildNights(twoNights, [10000, 10000], null, updated).map((n) => n.gstBp)).toEqual([
      500, 1200,
    ]);
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
        twoNights,
        [line([100, 1000])],
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
    expect(calculateQuote(stay, twoNights, [line([100, 1001])], null, slabs).quoteHash).not.toBe(
      q.quoteHash,
    );
  });
});

describe("B10 multi-room calculation", () => {
  const threeNights = ["2026-11-14", "2026-11-15", "2026-11-16"];
  const threeNightStay = { checkIn: "2026-11-14", checkOut: "2026-11-17" };

  it("allocates a flat promo over 2 lines x 3 nights in (line, date) order, R09-safe", () => {
    // Cells flattened: line 1 [100, 5000, 5000], line 2 [5000, 5000, 200]. Value 3000.
    const lines = [line([100, 5000, 5000]), line([5000, 5000, 200], { roomTypeId: "r2" })];
    const q = calculateQuote(
      threeNightStay,
      threeNights,
      lines,
      { code: "FLAT", kind: "flat", value: 3000 },
      slabs,
    );
    const cells = q.lines.flatMap((l) => l.nights.map((n) => n.discountPaise));
    // Equal shares of 500, capped at 100 and 200; the 700 left is shared again in cell order.
    expect(cells).toEqual([100, 675, 675, 675, 675, 200]);
    expect(cells.reduce((s, d) => s + d, 0)).toBe(3000);
    expect(q.lines.map((l) => l.discountPaise)).toEqual([1450, 1550]);
    q.lines.forEach((l, li) =>
      l.nights.forEach((n, di) => {
        expect(n.discountPaise).toBeGreaterThanOrEqual(0);
        expect(n.discountPaise).toBeLessThanOrEqual(lines[li].rates[di]);
      }),
    );
    // A promo worth more than the whole cart takes every cell to zero, no further.
    const all = calculateQuote(
      threeNightStay,
      threeNights,
      lines,
      { code: "BIG", kind: "flat", value: 10_000_000 },
      slabs,
    );
    expect(all.discountPaise).toBe(all.subtotalPaise);
    expect(all.totalPaise).toBe(0);
  });

  it("two Rs 4,000 rooms on one night stay at 5% GST: per cell, never a per date sum", () => {
    const q = calculateQuote(
      { checkIn: "2026-11-14", checkOut: "2026-11-15" },
      ["2026-11-14"],
      [line([400000]), line([400000])],
      null,
      slabs,
    );
    // Rs 8,000 summed across rooms would hit the 18% slab; each Rs 4,000 cell is 5%.
    expect(q.lines.flatMap((l) => l.nights.map((n) => n.gstBp))).toEqual([500, 500]);
    expect(q.gstPaise).toBe(40000);
  });

  it("order totals = sum of line totals = sum of cells, with no re-rounding", () => {
    const q = calculateQuote(
      threeNightStay,
      threeNights,
      [line([333333, 750001, 101]), line([12345, 67890, 750000]), line([1, 2, 3])],
      { code: "PCT", kind: "pct", value: 7 },
      slabs,
    );
    const cells = q.lines.flatMap((l) => l.nights);
    expect(q.subtotalPaise).toBe(cells.reduce((s, n) => s + n.ratePaise, 0));
    expect(q.discountPaise).toBe(cells.reduce((s, n) => s + n.discountPaise, 0));
    expect(q.gstPaise).toBe(cells.reduce((s, n) => s + n.gstPaise, 0));
    expect(q.totalPaise).toBe(q.lines.reduce((s, l) => s + l.totalPaise, 0));
    for (const l of q.lines)
      expect(l.totalPaise).toBe(l.subtotalPaise - l.discountPaise + l.gstPaise);
    expect(q.lines.map((l) => l.lineNo)).toEqual([1, 2, 3]);
  });

  it("line order changes the hash; the flat total is the same either way", () => {
    const a = line([100, 1000]);
    const b = line([1000, 1000], { roomTypeId: "r2" });
    const promo = { code: "FLAT", kind: "flat", value: 1001 } as const;
    const ab = calculateQuote(stay, twoNights, [a, b], promo, slabs);
    const ba = calculateQuote(stay, twoNights, [b, a], promo, slabs);
    expect(ab.quoteHash).not.toBe(ba.quoteHash);
    expect(ab.discountPaise).toBe(ba.discountPaise);
  });

  it("rejects a line with a missing nightly rate", () => {
    expect(() => calculateQuote(stay, twoNights, [line([100])], null, slabs)).toThrow(
      "Missing nightly rate",
    );
  });
});

describe("missing tax slab location", () => {
  // Slabs cover only up to Rs 7,500: a Rs 8,000 cell has no matching slab.
  const partial = [{ minPaise: 0, maxPaise: 750000, gstBp: 500, effectiveFrom: "2025-09-22" }];

  it("reports the line whose cell has no slab", () => {
    const run = () =>
      calculateQuote(
        stay,
        twoNights,
        [line([400000, 400000]), line([800000, 800000], { roomTypeId: "r2" })],
        null,
        partial,
      );
    expect(run).toThrow(MissingTaxSlab);
    try {
      run();
    } catch (error) {
      expect((error as MissingTaxSlab).lineIndex).toBe(1);
    }
  });
});
