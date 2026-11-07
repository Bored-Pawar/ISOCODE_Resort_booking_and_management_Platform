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

/**
 * Stub pricing (until B1): one fixed nightly rate per room type, whatever the plan or date.
 * Not real prices; it only keeps stub quotes internally consistent for any valid stay.
 */
export const STUB_NIGHT_RATE_PAISE: Record<string, number> = {
  "rt-plantation-room": 640000,
  "rt-estate-suite": 950000,
  "rt-garden-villa": 1450000,
  "rt-pool-villa": 2400000,
};

/** Stub GST: 5% up to Rs 7,500 per night (inclusive), 18% above. Mirrors the seeded slabs. */
export const STUB_SLAB_LIMIT_PAISE = 750000;

/** The only promo the stub accepts: 10% off. */
export const STUB_PROMO = { code: "WELCOME10", kind: "pct", value: 10 } as const;
