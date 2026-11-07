import { describe, expect, it } from "vitest";
import { buildNights, nightDiscounts, pickGstBp, rng, seedRatePaise } from "./pricing";
import { taxSlabSeeds } from "./data";

describe("seed pricing", () => {
  it("picks the GST slab on both sides of the boundary", () => {
    expect(pickGstBp(750000, taxSlabSeeds)).toBe(500);
    expect(pickGstBp(750001, taxSlabSeeds)).toBe(1800);
  });
  it("charges more on weekends and in peak season", () => {
    const sat = seedRatePaise(6200, 0, "2026-11-14"); // Saturday
    const tue = seedRatePaise(6200, 0, "2026-11-10"); // Tuesday
    expect(sat).toBeGreaterThan(tue);
    expect(seedRatePaise(6200, 0, "2026-12-15")).toBeGreaterThan(
      seedRatePaise(6200, 0, "2026-11-10"),
    );
    expect(sat % 5000).toBe(0);
  });
  it("splits discounts exactly", () => {
    expect(nightDiscounts([800000, 640000], { kind: "pct", value: 10 })).toEqual([80000, 64000]);
    const flat = nightDiscounts([800000, 640000, 700000], { kind: "flat", value: 100001 });
    expect(flat.reduce((a, b) => a + b, 0)).toBe(100001);
  });
  it("applies GST after discount", () => {
    // 8,200 rupees crosses the line, but a 10% discount (7,380) drops it to the 5% slab.
    const [night] = buildNights(["2026-11-14"], [820000], { kind: "pct", value: 10 }, taxSlabSeeds);
    expect(night.gstBp).toBe(500);
    expect(night.gstPaise).toBe(36900);
  });
  it("is deterministic", () => {
    expect(rng(1)()).toBe(rng(1)());
  });
});
