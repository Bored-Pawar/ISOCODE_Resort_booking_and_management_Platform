import { createHash } from "node:crypto";
import type { Quote } from "./types";

type HashInput = Pick<Quote, "roomTypeId" | "ratePlanId" | "checkIn" | "checkOut" | "nights"> & {
  promo: Quote["promo"];
};

/**
 * Deterministic hash that ties the price a guest saw to the price a hold is taken at.
 * Covers room type, plan, dates, promo, and per night rate, discount and GST slab used.
 * Occupancy is excluded on purpose: it does not change the price.
 */
export function computeQuoteHash(q: HashInput): string {
  const canonical = JSON.stringify([
    q.roomTypeId,
    q.ratePlanId,
    q.checkIn,
    q.checkOut,
    q.promo ? [q.promo.code, q.promo.kind, q.promo.value] : null,
    q.nights.map((n) => [n.date, n.ratePaise, n.discountPaise, n.gstBp]),
  ]);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}
