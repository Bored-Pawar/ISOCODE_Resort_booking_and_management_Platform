import { calculateQuote, type Slab } from "./calculation";
import type { Quote } from "./types";

/** Fixture ids are stable strings; the DB seed (F3) uses its own uuids. */
export const FIXTURE_IDS = {
  plantationRoom: "rt-plantation-room",
  estateSuite: "rt-estate-suite",
  gardenVilla: "rt-garden-villa",
  poolVilla: "rt-pool-villa",
  planEP: "rp-plantation-ep",
  planCP: "rp-plantation-cp",
  suitePlanEP: "rp-suite-ep",
  guestAsha: "user-guest-asha",
} as const;

/** Mirrors the seeded slabs: 5% up to Rs 7,500 per night (inclusive), 18% above. */
const FIXTURE_SLABS: Slab[] = [
  { minPaise: 0, maxPaise: 750000, gstBp: 500, effectiveFrom: "2025-09-22" },
  { minPaise: 750001, maxPaise: null, gstBp: 1800, effectiveFrom: "2025-09-22" },
];
const stay = { checkIn: "2026-11-14", checkOut: "2026-11-16" };
const dates = ["2026-11-14", "2026-11-15"];

// Sat 14 Nov Rs 8,200 (18% slab, above Rs 7,500) and Sun 15 Nov Rs 6,400 (5% slab).
const plantationLine = {
  roomTypeId: FIXTURE_IDS.plantationRoom,
  ratePlanId: FIXTURE_IDS.planCP,
  adults: 2,
  children: 0,
  rates: [820000, 640000],
};
// Rs 9,500 both nights (18%).
const suiteLine = {
  roomTypeId: FIXTURE_IDS.estateSuite,
  ratePlanId: FIXTURE_IDS.suitePlanEP,
  adults: 2,
  children: 1,
  rates: [950000, 950000],
};

/** 1-line cart: 2 adults in a Plantation Room, bed and breakfast, 2 nights. */
export const quoteFixture: Quote = calculateQuote(
  stay,
  dates,
  [plantationLine],
  null,
  FIXTURE_SLABS,
);

/** 2-line cart: the Plantation Room above plus an Estate Suite for 2 adults and 1 child. */
export const twoRoomQuoteFixture: Quote = calculateQuote(
  stay,
  dates,
  [plantationLine, suiteLine],
  null,
  FIXTURE_SLABS,
);

/** Same 1-line stay after a rate edit: used to exercise PRICE_CHANGED. */
export const changedQuoteFixture: Quote = calculateQuote(
  stay,
  dates,
  [{ ...plantationLine, rates: [850000, 640000] }],
  null,
  FIXTURE_SLABS,
);

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
