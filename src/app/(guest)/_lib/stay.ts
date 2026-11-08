/**
 * Stay builder rules (/rooms): suggesting rooms for a group, the party a single room can take, and
 * the rough room count an enquiry should carry. Pure and dependency free (types only), so client
 * components can import it. No prices are computed here; prices come from pricing on the server.
 */
import type { RoomCapacity } from "@/lib/occupancy";
import { demandByType, MAX_CART_ROOMS, type CartLine, type Party } from "./cart";
import type { RoomOption } from "./book";

/**
 * The party one room of this type takes by default: the search party when it fits (B10 rule 1),
 * otherwise the largest party that fits, adults first.
 */
export function partyForRoom(room: RoomCapacity, party: Party): Party {
  const adults = Math.min(Math.max(party.adults, 1), room.maxAdults);
  const children = Math.min(Math.max(party.children, 0), room.maxOccupancy - adults);
  return { adults, children };
}

/** Rooms of a type a guest may still add: free units minus the lines of that type in the cart. */
export function roomsLeftToAdd(room: Pick<RoomOption, "id" | "freeUnits">, lines: CartLine[]) {
  return Math.max(room.freeUnits - (demandByType(lines).get(room.id) ?? 0), 0);
}

/** Why "Add room" is off for this type, or null when it may be added. */
export function addBlockedReason(
  room: Pick<RoomOption, "id" | "freeUnits" | "plans">,
  lines: CartLine[],
): string | null {
  if (room.freeUnits === 0 || room.plans.length === 0) return "Not available for these dates";
  if (lines.length >= MAX_CART_ROOMS)
    return `Your stay has ${MAX_CART_ROOMS} rooms, the most online`;
  if (roomsLeftToAdd(room, lines) === 0) return "All free rooms of this type are in your stay";
  return null;
}

/**
 * Spreads a party over room types in the given order: one adult per room, the other adults
 * round-robin into rooms with adult space, then children one at a time into the room with the most
 * space left. Returns null when the rooms cannot take the party.
 */
export function splitAcross(types: RoomCapacity[], party: Party): Party[] | null {
  const n = types.length;
  const maxA = types.reduce((s, t) => s + t.maxAdults, 0);
  const maxO = types.reduce((s, t) => s + t.maxOccupancy, 0);
  if (n === 0 || party.adults < n || party.adults > maxA || party.adults + party.children > maxO)
    return null;
  const out = types.map(() => ({ adults: 1, children: 0 }));
  let adults = party.adults - n;
  while (adults > 0) {
    for (let i = 0; i < n && adults > 0; i++) {
      if (out[i].adults < types[i].maxAdults) {
        out[i].adults += 1;
        adults -= 1;
      }
    }
  }
  for (let c = 0; c < party.children; c++) {
    let best = 0;
    for (let i = 1; i < n; i++) {
      const space = (j: number) => types[j].maxOccupancy - out[j].adults - out[j].children;
      if (space(i) > space(best)) best = i;
    }
    out[best].children += 1;
  }
  return out;
}

/**
 * A starting cart for the group: the fewest rooms (at most 4, never above free stock) that hold
 * everyone, then the least spare space, then the fewest different types, then catalog order. Each
 * line takes the room's default plan. Null when no such cart exists (a group enquiry).
 */
export function suggestCart(rooms: RoomOption[], party: Party): CartLine[] | null {
  const usable = rooms.filter((r) => r.freeUnits > 0 && r.plans.length > 0);
  const total = party.adults + party.children;
  type Pick = { idx: number[]; waste: number; kinds: number };
  let best: Pick | null = null;

  const better = (a: Pick, b: Pick | null) =>
    !b ||
    a.idx.length < b.idx.length ||
    (a.idx.length === b.idx.length &&
      (a.waste < b.waste ||
        (a.waste === b.waste &&
          (a.kinds < b.kinds || (a.kinds === b.kinds && a.idx.join() < b.idx.join())))));

  const walk = (idx: number[], from: number) => {
    if (idx.length > 0) {
      const types = idx.map((i) => usable[i]);
      const maxA = types.reduce((s, t) => s + t.maxAdults, 0);
      const maxO = types.reduce((s, t) => s + t.maxOccupancy, 0);
      if (idx.length <= party.adults && maxA >= party.adults && maxO >= total) {
        const pick = { idx: [...idx], waste: maxO - total, kinds: new Set(idx).size };
        if (better(pick, best)) best = pick;
        return; // adding rooms only makes it worse
      }
    }
    if (idx.length === MAX_CART_ROOMS) return;
    for (let i = from; i < usable.length; i++) {
      const used = idx.filter((j) => j === i).length;
      if (used >= usable[i].freeUnits) continue;
      idx.push(i);
      walk(idx, i);
      idx.pop();
    }
  };
  walk([], 0);

  const chosen = best as Pick | null;
  if (!chosen) return null;
  const types = chosen.idx.map((i) => usable[i]);
  const split = splitAcross(types, party);
  if (!split) return null;
  return types.map((t, i) => ({
    roomTypeId: t.id,
    ratePlanId: t.defaultPlanId ?? t.plans[0].id,
    ...split[i],
  }));
}

/**
 * Rooms to mention in an enquiry: the cart's rooms when it has some, otherwise the fewest rooms of
 * the largest type the group would need (rule of thumb for the team, not an offer).
 */
export function roomsForEnquiry(rooms: RoomCapacity[], party: Party, lines: CartLine[]): number {
  if (lines.length > 0) return lines.length;
  if (rooms.length === 0) return 1;
  const maxA = Math.max(...rooms.map((r) => r.maxAdults));
  const maxO = Math.max(...rooms.map((r) => r.maxOccupancy));
  return Math.max(
    1,
    Math.ceil(party.adults / maxA),
    Math.ceil((party.adults + party.children) / maxO),
  );
}
