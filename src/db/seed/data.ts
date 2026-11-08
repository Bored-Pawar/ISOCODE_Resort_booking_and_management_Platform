/** Static seed data. All names, contacts and prices are invented (assumption A6). */

export const DEMO_PASSWORD = "Demo@12345";

export const staffUsers = [
  { email: "reservations@companya.example", name: "Priya Reservations", role: "reservations" },
  { email: "sales@companya.example", name: "Arjun Sales", role: "sales" },
  { email: "gm@companya.example", name: "Meenakshi GM", role: "gm" },
] as const;

export const guestUsers = [
  { email: "asha@guest.example", name: "Asha Kulkarni", phone: "+910000000011" },
  { email: "ravi@guest.example", name: "Ravi Menon", phone: "+910000000012" },
] as const;

/**
 * Assumption A9. Website allotment is ~40% of total units, rest is agency stock.
 * B10: maxOccupancy caps adults + children per room; maxChildren is stored, not enforced.
 */
export const roomTypeSeeds = [
  {
    slug: "plantation-room",
    name: "Plantation Room",
    description:
      "A calm room with white linen, wooden floors and a window onto the coffee rows. A private balcony catches the morning mist.",
    totalUnits: 40,
    allotment: 16,
    maxAdults: 2,
    maxChildren: 1,
    maxOccupancy: 3,
    baseRupees: 6200,
    amenities: ["Plantation view", "Balcony", "Wi-Fi", "Tea and coffee kit", "Hot water"],
    photoAlts: [
      "Room with wooden floor and white linen",
      "Bathroom",
      "Balcony over the plantation",
    ],
  },
  {
    slug: "estate-suite",
    name: "Estate Suite",
    description:
      "A larger suite with a sitting area, a stone bath and a view from the bed across the estate.",
    totalUnits: 24,
    allotment: 10,
    maxAdults: 3,
    maxChildren: 1,
    maxOccupancy: 4,
    baseRupees: 9500,
    amenities: ["Sitting area", "Stone bath", "Plantation view", "Wi-Fi", "Tea and coffee kit"],
    photoAlts: ["Suite with sitting area", "Bath with stone finish", "View from the bed"],
  },
  {
    slug: "garden-villa",
    name: "Garden Villa",
    description:
      "A private villa set in the garden, with a living room and its own sit-out for evenings.",
    totalUnits: 8,
    allotment: 3,
    maxAdults: 3,
    maxChildren: 2,
    maxOccupancy: 5,
    baseRupees: 12500,
    amenities: ["Private sit-out", "Living room", "Garden view", "Wi-Fi", "Kitchenette"],
    photoAlts: ["Villa exterior in the garden", "Living room", "Private sit-out"],
  },
  {
    slug: "pool-villa",
    name: "Pool Villa",
    description:
      "A villa with its own plunge pool overlooking the hills. Quiet, private and made for long stays.",
    totalUnits: 4,
    allotment: 2,
    maxAdults: 4,
    maxChildren: 2,
    maxOccupancy: 6,
    baseRupees: 18000,
    amenities: ["Private plunge pool", "Living room", "Hill view", "Wi-Fi", "Butler on call"],
    photoAlts: ["Villa with a private plunge pool", "Bedroom", "Pool at dusk"],
  },
] as const;

export const ratePlanSeeds = [
  { code: "EP", name: "Room only", inclusions: "No meals", refundable: true, addRupees: 0 },
  {
    code: "CP",
    name: "Bed and breakfast",
    inclusions: "Breakfast for all guests",
    refundable: true,
    addRupees: 800,
  },
  {
    code: "MAP",
    name: "Breakfast and dinner",
    inclusions: "Breakfast and dinner for all guests",
    refundable: false,
    addRupees: 2200,
  },
] as const;

/**
 * GST on hotel accommodation, per night on the room value after discount:
 * up to Rs 7,500 -> 5%, above -> 18% (rates in force from 22 Sep 2025).
 * VERIFY before go-live (docs/00 assumption A2). Bounds are inclusive.
 */
export const taxSlabSeeds = [
  { minPaise: 0, maxPaise: 750000, gstBp: 500, effectiveFrom: "2025-09-22" },
  { minPaise: 750001, maxPaise: null, gstBp: 1800, effectiveFrom: "2025-09-22" },
] as const;

/** `value` is a percent for pct, and paise for flat. */
export const promoSeeds = [
  { code: "WELCOME10", kind: "pct", value: 10, minNights: 2, maxUses: 200, active: true },
  { code: "HILLS1000", kind: "flat", value: 100000, minNights: 2, maxUses: 100, active: true },
  { code: "MONSOON20", kind: "pct", value: 20, minNights: 1, maxUses: 50, active: false },
] as const;

/** Month (1-12) multipliers for seasonality. Dec-Jan peak, monsoon low. */
export const seasonMultiplier: Record<number, number> = {
  1: 1.3,
  2: 1.1,
  3: 1.0,
  4: 1.0,
  5: 0.95,
  6: 0.8,
  7: 0.8,
  8: 0.8,
  9: 0.85,
  10: 1.1,
  11: 1.1,
  12: 1.3,
};
