import type { RoomType } from "./index";

const plans = (prefix: string): RoomType["ratePlans"] => [
  {
    id: `rp-${prefix}-ep`,
    code: "EP",
    name: "Room only",
    inclusions: "No meals",
    refundable: true,
  },
  {
    id: `rp-${prefix}-cp`,
    code: "CP",
    name: "Bed and breakfast",
    inclusions: "Breakfast for all guests",
    refundable: true,
  },
  {
    id: `rp-${prefix}-map`,
    code: "MAP",
    name: "Breakfast and dinner",
    inclusions: "Breakfast and dinner for all guests",
    refundable: false,
  },
];

const photos = (slug: string, alts: string[]) =>
  alts.map((alt, i) => ({ url: `/images/${slug}-${i + 1}.jpg`, alt, width: 2000, height: 1333 }));

const amenitiesBase = [
  "Plantation view",
  "Wi-Fi",
  "Tea and coffee kit",
  "Hot water",
  "Wooden floors",
];

export const roomTypesFixture: RoomType[] = [
  {
    id: "rt-plantation-room",
    slug: "plantation-room",
    name: "Plantation Room",
    description: "A calm room with white linen and a window onto the coffee rows.",
    totalUnits: 40,
    maxAdults: 2,
    maxChildren: 1,
    amenities: amenitiesBase,
    photos: photos("plantation-room", ["Room with wooden floor", "Bathroom", "Balcony"]),
    ratePlans: plans("plantation"),
  },
  {
    id: "rt-estate-suite",
    slug: "estate-suite",
    name: "Estate Suite",
    description: "A larger suite with a sitting area and a stone bath.",
    totalUnits: 24,
    maxAdults: 3,
    maxChildren: 1,
    amenities: [...amenitiesBase, "Sitting area", "Stone bath"],
    photos: photos("estate-suite", ["Suite with sitting area", "Stone bath", "View from bed"]),
    ratePlans: plans("suite"),
  },
  {
    id: "rt-garden-villa",
    slug: "garden-villa",
    name: "Garden Villa",
    description: "A private villa set in the garden with its own sit-out.",
    totalUnits: 8,
    maxAdults: 3,
    maxChildren: 2,
    amenities: [...amenitiesBase, "Private sit-out", "Living room"],
    photos: photos("garden-villa", ["Villa exterior", "Living room", "Private sit-out"]),
    ratePlans: plans("garden"),
  },
  {
    id: "rt-pool-villa",
    slug: "pool-villa",
    name: "Pool Villa",
    description: "A villa with its own plunge pool overlooking the hills.",
    totalUnits: 4,
    maxAdults: 4,
    maxChildren: 2,
    amenities: [...amenitiesBase, "Private plunge pool", "Living room"],
    photos: photos("pool-villa", ["Villa with plunge pool", "Bedroom", "Pool at dusk"]),
    ratePlans: plans("pool"),
  },
];
