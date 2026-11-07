/**
 * FROZEN CONTRACT (C1/C2). Changing signatures needs scrum master approval.
 * pricing.quote() is the only source of prices in the app. The stub below is coherent for any
 * valid room, plan and dates (nights come from the requested dates, hash from those nights)
 * until B1 replaces it.
 */
import { eachNight } from "@/lib/dates";
import { applyBp } from "@/lib/money";
import { catalog } from "@/modules/catalog";
import { computeQuoteHash } from "./hash";
import { STUB_NIGHT_RATE_PAISE, STUB_PROMO, STUB_SLAB_LIMIT_PAISE } from "./fixtures";
import { quoteInputSchema, type QuoteInput, type QuoteNight, type QuoteResult } from "./types";

export * from "./types";
export { computeQuoteHash } from "./hash";
export { quoteFixture, changedQuoteFixture, FIXTURE_IDS } from "./fixtures";

export const pricing = {
  async quote(input: QuoteInput): Promise<QuoteResult> {
    const parsed = quoteInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    const p = parsed.data;

    const room = (await catalog.listRoomTypes()).find((r) => r.id === p.roomTypeId);
    const rate = STUB_NIGHT_RATE_PAISE[p.roomTypeId];
    if (!room || rate === undefined || !room.ratePlans.some((pl) => pl.id === p.ratePlanId)) {
      return { ok: false, code: "NO_RATE" };
    }
    if (p.adults > room.maxAdults || p.children > room.maxChildren) {
      return { ok: false, code: "OVER_OCCUPANCY" };
    }
    let promo: { code: string; kind: "pct" | "flat"; value: number } | null = null;
    if (p.promoCode) {
      if (p.promoCode.toUpperCase() !== STUB_PROMO.code)
        return { ok: false, code: "PROMO_INVALID" };
      promo = { ...STUB_PROMO };
    }

    const nights: QuoteNight[] = eachNight(p.checkIn, p.checkOut).map((date) => {
      const discountPaise = promo ? applyBp(rate, promo.value * 100) : 0;
      const gstBp = rate - discountPaise <= STUB_SLAB_LIMIT_PAISE ? 500 : 1800;
      return {
        date,
        ratePaise: rate,
        discountPaise,
        gstBp,
        gstPaise: applyBp(rate - discountPaise, gstBp),
      };
    });
    const subtotalPaise = nights.reduce((s, n) => s + n.ratePaise, 0);
    const discountPaise = nights.reduce((s, n) => s + n.discountPaise, 0);
    const gstPaise = nights.reduce((s, n) => s + n.gstPaise, 0);
    const base = {
      roomTypeId: p.roomTypeId,
      ratePlanId: p.ratePlanId,
      checkIn: p.checkIn,
      checkOut: p.checkOut,
      nights,
      promo,
    };
    return {
      ok: true,
      quote: {
        ...base,
        subtotalPaise,
        discountPaise,
        gstPaise,
        totalPaise: subtotalPaise - discountPaise + gstPaise,
        quoteHash: computeQuoteHash(base),
      },
    };
  },
};
