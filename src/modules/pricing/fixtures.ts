import { computeQuoteHash } from "./hash";
import type { Quote, QuoteNight } from "./types";

/** Fixture ids are stable strings; the DB seed (F3) uses its own uuids. */
export const FIXTURE_IDS = {
  plantationRoom: "rt-plantation-room",
  estateSuite: "rt-estate-suite",
  gardenVilla: "rt-garden-villa",
  poolVilla: "rt-pool-villa",
  planEP: "rp-plantation-ep",
  planCP: "rp-plantation-cp",
  guestAsha: "user-guest-asha",
} as const;

// Sat 14 Nov ₹8,200 (18% slab, above ₹7,500) and Sun 15 Nov ₹6,400 (5% slab).
const nights: QuoteNight[] = [
  { date: "2026-11-14", ratePaise: 820000, discountPaise: 0, gstBp: 1800, gstPaise: 147600 },
  { date: "2026-11-15", ratePaise: 640000, discountPaise: 0, gstBp: 500, gstPaise: 32000 },
];

const base = {
  roomTypeId: FIXTURE_IDS.plantationRoom,
  ratePlanId: FIXTURE_IDS.planCP,
  checkIn: "2026-11-14",
  checkOut: "2026-11-16",
  nights,
  promo: null,
};

export const quoteFixture: Quote = {
  ...base,
  subtotalPaise: 1460000,
  discountPaise: 0,
  gstPaise: 179600,
  totalPaise: 1639600,
  quoteHash: computeQuoteHash(base),
};

/** Same stay after a rate edit: used to exercise PRICE_CHANGED. */
const changedNights: QuoteNight[] = [
  { ...nights[0], ratePaise: 850000, gstPaise: 153000 },
  nights[1],
];
const changedBase = { ...base, nights: changedNights };
export const changedQuoteFixture: Quote = {
  ...changedBase,
  subtotalPaise: 1490000,
  discountPaise: 0,
  gstPaise: 185000,
  totalPaise: 1675000,
  quoteHash: computeQuoteHash(changedBase),
};
