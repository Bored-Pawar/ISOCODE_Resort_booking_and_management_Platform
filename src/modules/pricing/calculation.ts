import { applyBp } from "@/lib/money";
import { computeQuoteHash } from "./hash";
import type { Quote, QuoteNight } from "./types";

export type Slab = {
  minPaise: number;
  maxPaise: number | null;
  gstBp: number;
  effectiveFrom: string;
};
export type Promo = { kind: "pct" | "flat"; value: number };

export class MissingTaxSlab extends Error {}

/** Each effective date defines a complete schedule; never fall back to an older schedule. */
export function pickGstBp(valuePaise: number, slabs: readonly Slab[], date: string): number {
  const effective = slabs
    .filter((s) => s.effectiveFrom <= date)
    .map((s) => s.effectiveFrom)
    .sort()
    .at(-1);
  const matches = slabs.filter(
    (s) =>
      s.effectiveFrom === effective &&
      valuePaise >= s.minPaise &&
      (s.maxPaise === null || valuePaise <= s.maxPaise),
  );
  if (!matches.length) throw new MissingTaxSlab(`No GST slab for ${date}: ${valuePaise}`);
  if (matches.length !== 1) throw new Error(`Overlapping GST slabs for ${date}: ${valuePaise}`);
  return matches[0].gstBp;
}

/** Equal flat shares, capped at each rate; redistribute unused shares in date order (R09). */
export function nightDiscounts(rates: number[], promo: Promo | null): number[] {
  if (!promo) return rates.map(() => 0);
  if (promo.kind === "pct") {
    return rates.map((r) => Math.min(r, applyBp(r, Math.min(promo.value, 100) * 100)));
  }
  let remaining = Math.min(
    promo.value,
    rates.reduce((sum, rate) => sum + rate, 0),
  );
  const discounts = rates.map(() => 0);
  let eligible = rates.map((_, i) => i).filter((i) => rates[i] > 0);
  while (remaining > 0 && eligible.length) {
    const share = Math.floor(remaining / eligible.length);
    const remainder = remaining % eligible.length;
    eligible.forEach((i, position) => {
      const amount = Math.min(rates[i] - discounts[i], share + (position < remainder ? 1 : 0));
      discounts[i] += amount;
      remaining -= amount;
    });
    eligible = eligible.filter((i) => discounts[i] < rates[i]);
  }
  return discounts;
}

export function buildNights(
  dates: string[],
  rates: number[],
  promo: Promo | null,
  slabs: readonly Slab[],
): QuoteNight[] {
  if (dates.length !== rates.length) throw new Error("Missing nightly rate");
  const discounts = nightDiscounts(rates, promo);
  return dates.map((date, i) => {
    const gstBp = pickGstBp(rates[i] - discounts[i], slabs, date);
    return {
      date,
      ratePaise: rates[i],
      discountPaise: discounts[i],
      gstBp,
      gstPaise: applyBp(rates[i] - discounts[i], gstBp),
    };
  });
}

/** The same snapshot assembly is used by live quotes and seed bookings. */
export function calculateQuote(
  stay: Pick<Quote, "roomTypeId" | "ratePlanId" | "checkIn" | "checkOut">,
  dates: string[],
  rates: number[],
  promo: Quote["promo"],
  slabs: readonly Slab[],
): Quote {
  const nights = buildNights(dates, rates, promo, slabs);
  const subtotalPaise = nights.reduce((s, n) => s + n.ratePaise, 0);
  const discountPaise = nights.reduce((s, n) => s + n.discountPaise, 0);
  const gstPaise = nights.reduce((s, n) => s + n.gstPaise, 0);
  const base = {
    roomTypeId: stay.roomTypeId,
    ratePlanId: stay.ratePlanId,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    nights,
    promo,
  };
  return {
    ...base,
    subtotalPaise,
    discountPaise,
    gstPaise,
    totalPaise: subtotalPaise - discountPaise + gstPaise,
    quoteHash: computeQuoteHash(base),
  };
}
