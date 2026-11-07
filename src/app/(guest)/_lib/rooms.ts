/**
 * Pure rules for one card in the rooms list. The server component fetches availability and quotes,
 * this decides what the guest sees. No data access here.
 */
import type { RoomType } from "@/modules/catalog";
import type { Quote } from "@/modules/pricing";

export type Party = { adults: number; children: number };

export type RoomAvailabilityView = {
  availableUnits: number;
  soldOut: boolean;
  blackedOut: boolean;
};

export type PlanQuote = { planId: string; planName: string; quote: Quote };

export type RoomListItem =
  | {
      kind: "available";
      room: RoomType;
      cheapest: PlanQuote;
      /** Number of rate plans that could be priced for these dates. */
      plansPriced: number;
    }
  | { kind: "sold-out"; room: RoomType }
  | { kind: "no-rates"; room: RoomType }
  | { kind: "over-occupancy"; room: RoomType };

export function fitsParty(room: RoomType, party: Party): boolean {
  return party.adults <= room.maxAdults && party.children <= room.maxChildren;
}

export function isFree(a: RoomAvailabilityView | undefined): boolean {
  return !!a && !a.soldOut && !a.blackedOut && a.availableUnits >= 1;
}

/** Whether this room is worth pricing: it takes the party and has a free unit every night. */
export function needsQuote(
  room: RoomType,
  availability: RoomAvailabilityView | undefined,
  party: Party,
): boolean {
  return fitsParty(room, party) && isFree(availability);
}

export function classifyRoom(input: {
  room: RoomType;
  availability: RoomAvailabilityView | undefined;
  party: Party;
  /** Quotes that came back ok. Empty when the room was not priced or no plan had rates. */
  quotes: PlanQuote[];
}): RoomListItem {
  const { room, availability, party, quotes } = input;
  if (!fitsParty(room, party)) return { kind: "over-occupancy", room };
  if (!isFree(availability)) return { kind: "sold-out", room };
  if (quotes.length === 0) return { kind: "no-rates", room };
  const cheapest = quotes.reduce((best, q) =>
    q.quote.totalPaise < best.quote.totalPaise ? q : best,
  );
  return { kind: "available", room, cheapest, plansPriced: quotes.length };
}

/** True when the party fits no room type at all, so the whole page should point to an enquiry. */
export function partyFitsNoRoom(rooms: RoomType[], party: Party): boolean {
  return rooms.length > 0 && rooms.every((r) => !fitsParty(r, party));
}
