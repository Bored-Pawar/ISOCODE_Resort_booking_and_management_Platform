export { buildNights, nightDiscounts, pickGstBp } from "@/modules/pricing/calculation";
import { seasonMultiplier } from "./data";

/** Demo rate generation only. Booking calculations live in modules/pricing. */

const ROUND_TO = 5000; // Rs 50 in paise

/** Friday and Saturday nights cost 20% more; month sets the season. */
export function seedRatePaise(baseRupees: number, addRupees: number, date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  const weekend = [5, 6].includes(d.getUTCDay()) ? 1.2 : 1;
  const season = seasonMultiplier[d.getUTCMonth() + 1] ?? 1;
  const raw = (baseRupees * season * weekend + addRupees) * 100;
  return Math.round(raw / ROUND_TO) * ROUND_TO;
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
