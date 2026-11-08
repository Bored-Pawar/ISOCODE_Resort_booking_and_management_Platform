import { applyBp } from "@/lib/money";
import { computeQuoteHash } from "./hash";
import type { Promo, Quote, QuoteLine, QuoteNight } from "./types";

export type Slab = {
  minPaise: number;
  maxPaise: number | null;
  gstBp: number;
  effectiveFrom: string;
};
export type PromoRule = Pick<Promo, "kind" | "value">;

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

/**
 * Discount per cell. Pct applies to each cell. Flat: equal shares, capped at each rate, with unused
 * shares redistributed in cell order (R09). Callers pass cells flattened in (line_no, date) order.
 */
export function nightDiscounts(rates: number[], promo: PromoRule | null): number[] {
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

/** One cell = one (line, date). GST slab is chosen on this cell's rate after its discount. */
export function buildNight(
  date: string,
  ratePaise: number,
  discountPaise: number,
  slabs: readonly Slab[],
): QuoteNight {
  const gstBp = pickGstBp(ratePaise - discountPaise, slabs, date);
  return {
    date,
    ratePaise,
    discountPaise,
    gstBp,
    gstPaise: applyBp(ratePaise - discountPaise, gstBp),
  };
}

/** Single-line helper kept for tests and seed tooling. */
export function buildNights(
  dates: string[],
  rates: number[],
  promo: PromoRule | null,
  slabs: readonly Slab[],
): QuoteNight[] {
  if (dates.length !== rates.length) throw new Error("Missing nightly rate");
  const discounts = nightDiscounts(rates, promo);
  return dates.map((date, i) => buildNight(date, rates[i], discounts[i], slabs));
}

export type LineInput = {
  roomTypeId: string;
  ratePlanId: string;
  adults: number;
  children: number;
  /** One rate per stay night, in date order. */
  rates: number[];
};

function sum(nights: QuoteNight[], key: "ratePaise" | "discountPaise" | "gstPaise"): number {
  return nights.reduce((s, n) => s + n[key], 0);
}

/**
 * The same snapshot assembly is used by live quotes and seed bookings.
 * Flat promo is allocated once over every cell flattened in (line_no, date) order; GST is per cell;
 * line totals sum their cells and order totals sum the lines. Nothing is re-rounded.
 */
export function calculateQuote(
  stay: Pick<Quote, "checkIn" | "checkOut">,
  dates: string[],
  lines: LineInput[],
  promo: Promo | null,
  slabs: readonly Slab[],
): Quote {
  for (const line of lines)
    if (line.rates.length !== dates.length) throw new Error("Missing nightly rate");
  const discounts = nightDiscounts(
    lines.flatMap((l) => l.rates),
    promo,
  );
  const quoteLines: QuoteLine[] = lines.map((line, li) => {
    const nights = dates.map((date, di) =>
      buildNight(date, line.rates[di], discounts[li * dates.length + di], slabs),
    );
    const subtotalPaise = sum(nights, "ratePaise");
    const discountPaise = sum(nights, "discountPaise");
    const gstPaise = sum(nights, "gstPaise");
    return {
      lineNo: li + 1,
      roomTypeId: line.roomTypeId,
      ratePlanId: line.ratePlanId,
      adults: line.adults,
      children: line.children,
      nights,
      subtotalPaise,
      discountPaise,
      gstPaise,
      totalPaise: subtotalPaise - discountPaise + gstPaise,
    };
  });
  const total = (key: "subtotalPaise" | "discountPaise" | "gstPaise" | "totalPaise") =>
    quoteLines.reduce((s, l) => s + l[key], 0);
  return {
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    promo,
    lines: quoteLines,
    subtotalPaise: total("subtotalPaise"),
    discountPaise: total("discountPaise"),
    gstPaise: total("gstPaise"),
    totalPaise: total("totalPaise"),
    quoteHash: computeQuoteHash({
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      promo,
      lines: quoteLines,
    }),
  };
}
