/**
 * Whole-catalog rule for the stay builder: can any mix of at most 4 rooms take the group?
 * Pure; no data access here.
 */
import type { RoomCapacity } from "@/lib/occupancy";
import { MAX_CART_ROOMS, type Party } from "./cart";

/**
 * True when no mix of at most 4 rooms (any types, repeats allowed) can hold the party under the
 * occupancy rule: the page points to a group enquiry. Stock is not considered here.
 */
export function partyFitsNoRoom(rooms: RoomCapacity[], party: Party): boolean {
  if (rooms.length === 0) return false;
  const total = party.adults + party.children;
  const search = (count: number, from: number, adults: number, occupancy: number): boolean => {
    if (count > 0 && count <= party.adults && adults >= party.adults && occupancy >= total) {
      return true;
    }
    if (count === MAX_CART_ROOMS) return false;
    for (let i = from; i < rooms.length; i++) {
      if (search(count + 1, i, adults + rooms[i].maxAdults, occupancy + rooms[i].maxOccupancy)) {
        return true;
      }
    }
    return false;
  };
  return !search(0, 0, 0, 0);
}
