import { createHash } from "node:crypto";
import type { Quote, QuoteLine } from "./types";

export type HashInput = Pick<Quote, "checkIn" | "checkOut" | "promo"> & {
  lines: Pick<QuoteLine, "roomTypeId" | "ratePlanId" | "nights">[];
};

/**
 * Deterministic hash that ties the price a guest saw to the price a hold is taken at.
 * Covers dates, promo, and each line in input order: room type, plan, and per night rate,
 * discount and GST slab used. Occupancy is excluded on purpose: it does not change the price.
 * Line order is included, so the UI must keep cart order stable between quote and hold.
 */
export function computeQuoteHash(q: HashInput): string {
  const canonical = JSON.stringify([
    q.checkIn,
    q.checkOut,
    q.promo ? [q.promo.code, q.promo.kind, q.promo.value] : null,
    q.lines.map((l) => [
      l.roomTypeId,
      l.ratePlanId,
      l.nights.map((n) => [n.date, n.ratePaise, n.discountPaise, n.gstBp]),
    ]),
  ]);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}
