/**
 * B10 room cart for guest screens: how many rooms a party needs, how to split it, and the cart
 * in the URL. Pure and dependency free (types only from modules), so client components can use it.
 * Line order is significant end to end: it is part of quoteHash, so encode and parse keep it.
 */
import { fitsRoom, type RoomCapacity } from "@/lib/occupancy";
import { isDateStr } from "@/lib/dates";

/** Mirrors pricing MAX_ROOMS_PER_BOOKING (a unit test keeps them equal). */
export const MAX_CART_ROOMS = 4;

export type Party = { adults: number; children: number };
export type CartLine = { roomTypeId: string; ratePlanId: string } & Party;
export type CartStay = { checkIn: string; checkOut: string } & Party;

/**
 * Fewest rooms of one type that take the whole party (B10 rule 1 per room), or null when it would
 * need more than MAX_CART_ROOMS: then the party is a group enquiry (rule 4).
 */
export function roomsNeeded(room: RoomCapacity, party: Party): number | null {
  for (let n = 1; n <= MAX_CART_ROOMS; n++) {
    if (
      party.adults >= n &&
      party.adults <= n * room.maxAdults &&
      party.adults + party.children <= n * room.maxOccupancy
    )
      return n;
  }
  return null;
}

/**
 * Splits a party over n rooms of one type: adults as evenly as possible (each room gets at least
 * one), then children one at a time into the room with the most space left. Every returned line
 * fits the room whenever roomsNeeded(room, party) <= n <= party.adults.
 */
export function splitParty(room: RoomCapacity, party: Party, n: number): Party[] {
  const lines = Array.from({ length: n }, (_, i) => ({
    adults: Math.floor(party.adults / n) + (i < party.adults % n ? 1 : 0),
    children: 0,
  }));
  for (let c = 0; c < party.children; c++) {
    const space = (l: Party) => room.maxOccupancy - l.adults - l.children;
    const best = lines.reduce((b, l) => (space(l) > space(b) ? l : b), lines[0]);
    best.children += 1;
  }
  return lines;
}

/** Guests from the original search not yet placed in a cart line. Negative means over-placed. */
export function guestsLeft(party: Party, lines: Party[]): Party {
  return {
    adults: party.adults - lines.reduce((s, l) => s + l.adults, 0),
    children: party.children - lines.reduce((s, l) => s + l.children, 0),
  };
}

export function linesFit(rooms: (RoomCapacity & { id: string })[], lines: CartLine[]): boolean {
  return lines.every((l) => {
    const room = rooms.find((r) => r.id === l.roomTypeId);
    return !!room && fitsRoom(room, l);
  });
}

/** Lines per room type: the stock a cart needs of each type. */
export function demandByType(lines: Pick<CartLine, "roomTypeId">[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l.roomTypeId, (m.get(l.roomTypeId) ?? 0) + 1);
  return m;
}

// ---- URL ------------------------------------------------------------------

const ID = /^[0-9A-Za-z-]{1,64}$/;

/** "<roomTypeId>.<ratePlanId>.<adults>.<children>" */
export function encodeLine(l: CartLine): string {
  return `${l.roomTypeId}.${l.ratePlanId}.${l.adults}.${l.children}`;
}

export function decodeLine(raw: string): CartLine | null {
  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  const [roomTypeId, ratePlanId, a, c] = parts;
  if (!ID.test(roomTypeId) || !ID.test(ratePlanId)) return null;
  if (!/^\d{1,2}$/.test(a) || !/^\d{1,2}$/.test(c)) return null;
  const adults = Number(a);
  const children = Number(c);
  if (adults < 1) return null;
  return { roomTypeId, ratePlanId, adults, children };
}

/** Query string for a stay: dates and group (for the still-to-place counter) plus the cart lines. */
export function stayQuery(stay: CartStay, lines: CartLine[]): URLSearchParams {
  const params = new URLSearchParams({
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    adults: String(stay.adults),
    children: String(stay.children),
  });
  for (const l of lines.slice(0, MAX_CART_ROOMS)) params.append("room", encodeLine(l));
  return params;
}

/** The stay builder (/rooms) with this cart. `/book` redirects here with its params. */
export function stayHref(stay: CartStay, lines: CartLine[], path = "/rooms"): string {
  return `${path}?${stayQuery(stay, lines).toString()}`;
}

/** Step 2 link: the cart plus the quoteHash of the price the guest was shown. */
export function detailsHref(stay: CartStay, lines: CartLine[], quoteHash: string): string {
  const params = stayQuery(stay, lines);
  params.set("quoteHash", quoteHash);
  return `/book/details?${params.toString()}`;
}

type RawParams = Record<string, string | string[] | undefined>;

export type ParsedCart = {
  checkIn: string;
  checkOut: string;
  party: Party;
  /** In URL order. Malformed entries are dropped; at most MAX_CART_ROOMS are kept. */
  lines: CartLine[];
  /** True when the URL carried malformed or extra lines that were dropped. */
  dropped: boolean;
};

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}
function count(raw: string, fallback: number): number {
  return /^\d{1,2}$/.test(raw) ? Number(raw) : fallback;
}

/** Reads untrusted /book params. Dates stay "" when malformed; the page validates the stay. */
export function parseCartParams(raw: RawParams): ParsedCart {
  const entries = raw.room === undefined ? [] : Array.isArray(raw.room) ? raw.room : [raw.room];
  const decoded = entries.map(decodeLine);
  const valid = decoded.filter((l): l is CartLine => l !== null);
  const checkIn = first(raw.checkIn);
  const checkOut = first(raw.checkOut);
  return {
    checkIn: isDateStr(checkIn) ? checkIn : "",
    checkOut: isDateStr(checkOut) ? checkOut : "",
    party: { adults: count(first(raw.adults), 0), children: count(first(raw.children), 0) },
    lines: valid.slice(0, MAX_CART_ROOMS),
    dropped: valid.length !== entries.length || valid.length > MAX_CART_ROOMS,
  };
}
