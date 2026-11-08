import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, Tx } from "@/lib/db";
import { eachNight } from "@/lib/dates";
import { fitsRoom } from "@/lib/occupancy";
import { calculateQuote, MissingTaxSlab, type Slab } from "./calculation";
import { quoteInputSchema, type Promo, type QuoteInput, type QuoteResult } from "./types";

type PromoRow = Promo & {
  active: boolean;
  validFrom: string;
  validTo: string;
  minNights: number;
  maxUses: number | null;
  usedCount: number;
};

type LineRow = {
  idx: number;
  found: boolean;
  maxAdults: number | null;
  maxOccupancy: number | null;
  rates: { date: string; pricePaise: number }[];
};

const uuid = z.uuid();

/**
 * One statement gives public reads and transaction repricing a coherent database snapshot for
 * every line of the cart. Line checks run in cart order; the first failing line is reported.
 */
export async function readQuote(db: Db | Tx, input: QuoteInput): Promise<QuoteResult> {
  const parsed = quoteInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const p = parsed.data;
  const badId = p.rooms.findIndex(
    (r) => !uuid.safeParse(r.roomTypeId).success || !uuid.safeParse(r.ratePlanId).success,
  );
  if (badId >= 0) return { ok: false, code: "NO_RATE", lineIndex: badId };

  const requested = sql.join(
    p.rooms.map((r, i) => sql`(${i}::int, ${r.roomTypeId}::uuid, ${r.ratePlanId}::uuid)`),
    sql`, `,
  );
  const rows = await db.execute<{ lines: LineRow[]; slabs: Slab[]; promo: PromoRow | null }>(sql`
    WITH req(idx, room_type_id, rate_plan_id) AS (VALUES ${requested})
    SELECT
      (SELECT jsonb_agg(jsonb_build_object(
          'idx', q.idx,
          'found', p.id IS NOT NULL,
          'maxAdults', r.max_adults,
          'maxOccupancy', r.max_occupancy,
          'rates', (SELECT coalesce(jsonb_agg(jsonb_build_object('date', d.date,
              'pricePaise', d.price_paise) ORDER BY d.date), '[]'::jsonb)
            FROM daily_rates d
            WHERE d.room_type_id = r.id AND d.rate_plan_id = p.id
              AND d.date >= ${p.checkIn}::date AND d.date < ${p.checkOut}::date))
        ORDER BY q.idx)
       FROM req q
       LEFT JOIN room_types r ON r.id = q.room_type_id
       LEFT JOIN rate_plans p ON p.id = q.rate_plan_id AND p.room_type_id = r.id AND p.active
      ) AS lines,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('minPaise', s.min_paise,
        'maxPaise', s.max_paise, 'gstBp', s.gst_bp, 'effectiveFrom', s.effective_from)), '[]'::jsonb)
        FROM tax_slabs s WHERE s.effective_from < ${p.checkOut}::date) AS slabs,
      (SELECT jsonb_build_object('code', c.code, 'kind', c.kind, 'value', c.value,
        'active', c.active, 'validFrom', c.valid_from, 'validTo', c.valid_to,
        'minNights', c.min_nights, 'maxUses', c.max_uses, 'usedCount', c.used_count)
        FROM promo_codes c WHERE upper(c.code) = ${p.promoCode?.toUpperCase() ?? null}) AS promo
  `);
  const row = rows[0];
  const dates = eachNight(p.checkIn, p.checkOut);
  for (const [i, room] of p.rooms.entries()) {
    const line = row.lines[i];
    if (!line?.found) return { ok: false, code: "NO_RATE", lineIndex: i };
    // B10 rule 1: 1 <= adults <= max_adults and adults + children <= max_occupancy.
    if (!fitsRoom({ maxAdults: line.maxAdults!, maxOccupancy: line.maxOccupancy! }, room)) {
      return { ok: false, code: "OVER_OCCUPANCY", lineIndex: i };
    }
    if (line.rates.length !== dates.length || line.rates.some((r, d) => r.date !== dates[d])) {
      return { ok: false, code: "NO_RATE", lineIndex: i };
    }
  }
  const promo = row.promo;
  if (
    p.promoCode &&
    (!promo ||
      !promo.active ||
      promo.validFrom > p.checkIn ||
      promo.validTo < dates[dates.length - 1] ||
      // min_nights is per stay, not per line.
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
        p.rooms.map((room, i) => ({
          roomTypeId: room.roomTypeId,
          ratePlanId: room.ratePlanId,
          adults: room.adults,
          children: room.children,
          rates: row.lines[i].rates.map((r) => r.pricePaise),
        })),
        promo ? { code: promo.code, kind: promo.kind, value: promo.value } : null,
        row.slabs,
      ),
    };
  } catch (error) {
    if (error instanceof MissingTaxSlab) {
      return { ok: false, code: "NO_RATE", lineIndex: error.lineIndex };
    }
    throw error;
  }
}
