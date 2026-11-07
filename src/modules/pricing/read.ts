import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, Tx } from "@/lib/db";
import { eachNight } from "@/lib/dates";
import { calculateQuote, MissingTaxSlab, type Slab } from "./calculation";
import { quoteInputSchema, type Quote, type QuoteInput, type QuoteResult } from "./types";

type PromoRow = NonNullable<Quote["promo"]> & {
  active: boolean;
  validFrom: string;
  validTo: string;
  minNights: number;
  maxUses: number | null;
  usedCount: number;
};

/** One statement gives public reads and transaction repricing a coherent database snapshot. */
export async function readQuote(db: Db | Tx, input: QuoteInput): Promise<QuoteResult> {
  const parsed = quoteInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const p = parsed.data;
  if (!z.uuid().safeParse(p.roomTypeId).success || !z.uuid().safeParse(p.ratePlanId).success) {
    return { ok: false, code: "NO_RATE" };
  }
  const rows = await db.execute<{
    max_adults: number;
    max_children: number;
    rates: { date: string; pricePaise: number }[];
    slabs: Slab[];
    promo: PromoRow | null;
  }>(sql`
    SELECT r.max_adults, r.max_children,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('date', d.date, 'pricePaise', d.price_paise)
         ORDER BY d.date), '[]'::jsonb) FROM daily_rates d
       WHERE d.room_type_id = r.id AND d.rate_plan_id = p.id
         AND d.date >= ${p.checkIn}::date AND d.date < ${p.checkOut}::date) AS rates,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('minPaise', s.min_paise,
        'maxPaise', s.max_paise, 'gstBp', s.gst_bp, 'effectiveFrom', s.effective_from)), '[]'::jsonb)
        FROM tax_slabs s WHERE s.effective_from < ${p.checkOut}::date) AS slabs,
      (SELECT jsonb_build_object('code', c.code, 'kind', c.kind, 'value', c.value,
        'active', c.active, 'validFrom', c.valid_from, 'validTo', c.valid_to,
        'minNights', c.min_nights, 'maxUses', c.max_uses, 'usedCount', c.used_count)
        FROM promo_codes c WHERE c.code = ${p.promoCode?.toUpperCase() ?? null}) AS promo
    FROM room_types r JOIN rate_plans p ON p.room_type_id = r.id AND p.active
    WHERE r.id = ${p.roomTypeId}::uuid AND p.id = ${p.ratePlanId}::uuid
  `);
  const row = rows[0];
  if (!row) return { ok: false, code: "NO_RATE" };
  if (p.adults > row.max_adults || p.children > row.max_children) {
    return { ok: false, code: "OVER_OCCUPANCY" };
  }
  const dates = eachNight(p.checkIn, p.checkOut);
  if (row.rates.length !== dates.length || row.rates.some((r, i) => r.date !== dates[i])) {
    return { ok: false, code: "NO_RATE" };
  }
  const promo = row.promo;
  if (
    p.promoCode &&
    (!promo ||
      !promo.active ||
      promo.validFrom > p.checkIn ||
      promo.validTo < dates[dates.length - 1] ||
      promo.minNights > dates.length ||
      (promo.maxUses !== null && promo.usedCount >= promo.maxUses))
  ) {
    return { ok: false, code: "PROMO_INVALID" };
  }
  try {
    return {
      ok: true,
      quote: calculateQuote(
        p,
        dates,
        row.rates.map((r) => r.pricePaise),
        promo ? { code: promo.code, kind: promo.kind, value: promo.value } : null,
        row.slabs,
      ),
    };
  } catch (error) {
    if (error instanceof MissingTaxSlab) return { ok: false, code: "NO_RATE" };
    throw error;
  }
}
