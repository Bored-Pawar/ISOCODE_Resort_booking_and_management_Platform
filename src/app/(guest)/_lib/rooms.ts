/**
 * Pure rules for one card in the rooms list. The server component fetches availability and quotes,
 * this decides what the guest sees. No data access here.
 *
 * B10: a party that does not fit one room is offered several rooms of the type (up to 4), split
 * by splitParty. More than 4 rooms, or more rooms than are free, is a group enquiry or a mixed
 * cart built on /book ("add another room").
 */
import type { RoomType } from "@/modules/catalog";
import type { Quote } from "@/modules/pricing";
import { roomsNeeded, splitParty, type Party } from "./cart";

export type { Party };

export type RoomAvailabilityView = {
  availableUnits: number;
  soldOut: boolean;
  blackedOut: boolean;
};

/** A priced cart of `rooms` lines of one room type on one plan, for the whole party. */
export type PlanQuote = { planId: string; planName: string; quote: Quote };

export type RoomListItem =
  | {
      kind: "available";
      room: RoomType;
      cheapest: PlanQuote;
      /** Number of rate plans that could be priced for these dates. */
      plansPriced: number;
      /** Rooms of this type the party needs (1 to 4). */
      rooms: number;
    }
  | { kind: "sold-out"; room: RoomType }
  /** Free, but fewer units than the party needs of this type. */
  | { kind: "short"; room: RoomType; rooms: number; availableUnits: number }
  | { kind: "no-rates"; room: RoomType }
  /** The party would need more than 4 rooms of this type. */
  | { kind: "over-occupancy"; room: RoomType };

export function freeUnits(a: RoomAvailabilityView | undefined): number {
  return a && !a.soldOut && !a.blackedOut ? Math.max(a.availableUnits, 0) : 0;
}

/** The split to price for this room type, or null when it cannot be offered as is. */
export function partyPlan(
  room: RoomType,
  availability: RoomAvailabilityView | undefined,
  party: Party,
): Party[] | null {
  const n = roomsNeeded(room, party);
  if (n === null || freeUnits(availability) < n) return null;
  return splitParty(room, party, n);
}

export function classifyRoom(input: {
  room: RoomType;
  availability: RoomAvailabilityView | undefined;
  party: Party;
  /** Quotes that came back ok. Empty when the room was not priced or no plan had rates. */
  quotes: PlanQuote[];
}): RoomListItem {
  const { room, availability, party, quotes } = input;
  const n = roomsNeeded(room, party);
  if (n === null) return { kind: "over-occupancy", room };
  const units = freeUnits(availability);
  if (units === 0) return { kind: "sold-out", room };
  if (units < n) return { kind: "short", room, rooms: n, availableUnits: units };
  if (quotes.length === 0) return { kind: "no-rates", room };
  const cheapest = quotes.reduce((best, q) =>
    q.quote.totalPaise < best.quote.totalPaise ? q : best,
  );
  return { kind: "available", room, cheapest, plansPriced: quotes.length, rooms: n };
}

/** True when every room type would need more than 4 rooms: the page points to an enquiry. */
export function partyFitsNoRoom(rooms: RoomType[], party: Party): boolean {
  return rooms.length > 0 && rooms.every((r) => roomsNeeded(r, party) === null);
}
