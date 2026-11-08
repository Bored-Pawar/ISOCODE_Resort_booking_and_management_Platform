/**
 * B10 rule 1, the one occupancy rule: a room fits a party line when adults >= 1,
 * adults <= max_adults and adults + children <= max_occupancy. max_children is not enforced.
 * Pure and dependency free: pricing enforces it, guest screens use it to explain and plan carts.
 */
export type RoomCapacity = { maxAdults: number; maxOccupancy: number };
export type PartyLine = { adults: number; children: number };

export function fitsRoom(room: RoomCapacity, line: PartyLine): boolean {
  return (
    Number.isInteger(line.adults) &&
    Number.isInteger(line.children) &&
    line.adults >= 1 &&
    line.children >= 0 &&
    line.adults <= room.maxAdults &&
    line.adults + line.children <= room.maxOccupancy
  );
}
