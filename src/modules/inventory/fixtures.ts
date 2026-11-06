import type { RoomAvailability } from "./index";

export const availabilityFixture: RoomAvailability[] = [
  { roomTypeId: "rt-plantation-room", availableUnits: 11, soldOut: false, blackedOut: false },
  { roomTypeId: "rt-estate-suite", availableUnits: 3, soldOut: false, blackedOut: false },
  { roomTypeId: "rt-garden-villa", availableUnits: 0, soldOut: true, blackedOut: false },
  { roomTypeId: "rt-pool-villa", availableUnits: 0, soldOut: true, blackedOut: true },
];
