import { applyBp } from "@/lib/money";
import { seasonMultiplier } from "./data";

/** Seed-local price maths. The app itself prices only through modules/pricing (B1). */

const ROUND_TO = 5000; // Rs 50 in paise

/** Friday and Saturday nights cost 20% more; month sets the season. */
export function seedRatePaise(baseRupees: number, addRupees: number, date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  const weekend = [5, 6].includes(d.getUTCDay()) ? 1.2 : 1;
  const season = seasonMultiplier[d.getUTCMonth() + 1] ?? 1;
  const raw = (baseRupees * season * weekend + addRupees) * 100;
  return Math.round(raw / ROUND_TO) * ROUND_TO;
}

export type Slab = { minPaise: number; maxPaise: number | null; gstBp: number };

/** Slab bounds are inclusive: 7,500.00 falls in the lower slab. */
export function pickGstBp(valuePaise: number, slabs: readonly Slab[]): number {
  const slab = slabs.find(
    (s) => valuePaise >= s.minPaise && (s.maxPaise === null || valuePaise <= s.maxPaise),
  );
  if (!slab) throw new Error(`No GST slab for ${valuePaise}`);
  return slab.gstBp;
}

export type Promo = { kind: "pct" | "flat"; value: number };

/** Per-night discounts; the sum is exactly the promo total (remainder goes to the first night). */
export function nightDiscounts(rates: number[], promo: Promo | null): number[] {
  if (!promo) return rates.map(() => 0);
  if (promo.kind === "pct") return rates.map((r) => Math.round((r * promo.value) / 100));
  const each = Math.floor(promo.value / rates.length);
  const out = rates.map((r) => Math.min(each, r));
  out[0] = Math.min(rates[0], out[0] + (promo.value - each * rates.length));
  return out;
}

export function buildNights(
  dates: string[],
  rates: number[],
  promo: Promo | null,
  slabs: readonly Slab[],
) {
  const discounts = nightDiscounts(rates, promo);
  return dates.map((date, i) => {
    const gstBp = pickGstBp(rates[i] - discounts[i], slabs);
    return {
      date,
      ratePaise: rates[i],
      discountPaise: discounts[i],
      gstBp,
      gstPaise: applyBp(rates[i] - discounts[i], gstBp),
    };
  });
}

/** Small deterministic PRNG (mulberry32) so seeded data is stable between runs. */
export function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
