/**
 * B6 step 1 (room cart) rules: per line problems, the guests-left counter and whether the guest
 * may continue. Pure; the client editor and the server page share it. Types only from modules.
 */
import { fitsRoom } from "@/lib/occupancy";
import type { Quote, QuoteResult } from "@/modules/pricing";
import { guestsLeft, MAX_CART_ROOMS, type CartLine, type Party } from "./cart";
import { plural } from "./format";

/** What the editor needs to know about one room type. Serializable server -> client. */
export type RoomOption = {
  id: string;
  slug: string;
  name: string;
  maxAdults: number;
  maxOccupancy: number;
  /** Free website units on every night of the stay (0 when sold out or blacked out). */
  freeUnits: number;
  plans: { id: string; name: string; inclusions: string; refundable: boolean }[];
  /** Plan a new line starts on: the cheapest priced plan for one room (decided on the server). */
  defaultPlanId?: string;
};

/** A room type card in "Rooms and packages": the editor's view plus what the card shows. */
export type RoomCardView = RoomOption & {
  description: string;
  photo: { url: string; alt: string; width: number; height: number } | null;
  /** Cheapest plan for one room for the whole stay, from pricing. Null when nothing is priced. */
  from: { planName: string; totalPaise: number; gstPaise: number; perNightPaise: number } | null;
};

/** The quote the server computed for the cart in the URL, minus anything the browser need not see. */
export type CartQuote =
  { ok: true; quote: Quote } | { ok: false; code: string; lineIndex?: number } | null;

export function toCartQuote(result: QuoteResult | null): CartQuote {
  if (!result) return null;
  if (result.ok) return { ok: true, quote: result.quote };
  return "lineIndex" in result && result.lineIndex !== undefined
    ? { ok: false, code: result.code, lineIndex: result.lineIndex }
    : { ok: false, code: result.code };
}

function quoteLineMessage(code: string): string {
  switch (code) {
    case "NO_RATE":
      return "We have no price for this room and plan on these dates. Try another plan or room.";
    case "OVER_OCCUPANCY":
      return "Too many guests for this room. Move someone to another room.";
    default:
      return "We could not price this room. Change it or try again.";
  }
}

/**
 * One message per line, or null when the line is fine. Checked in this order: a room and plan are
 * chosen, occupancy (B10 rule 1), stock (lines of a type never above its free units), then any
 * pricing error the server returned for that line (lineIndex).
 */
export function lineIssues(
  rooms: RoomOption[],
  lines: CartLine[],
  quote: CartQuote,
): (string | null)[] {
  const used = new Map<string, number>();
  return lines.map((line, i) => {
    const room = rooms.find((r) => r.id === line.roomTypeId);
    if (!room) return "Choose a room.";
    if (!room.plans.some((p) => p.id === line.ratePlanId)) return "Choose a plan.";
    if (line.adults < 1) return "Each room needs at least 1 adult.";
    if (line.adults > room.maxAdults)
      return `This room takes at most ${plural(room.maxAdults, "adult")}.`;
    if (!fitsRoom(room, line))
      return `This room takes up to ${plural(room.maxOccupancy, "guest")}.`;
    const n = (used.get(room.id) ?? 0) + 1;
    used.set(room.id, n);
    if (n > room.freeUnits)
      return room.freeUnits === 0
        ? `The ${room.name} is not free for these dates.`
        : `Only ${room.freeUnits} ${room.name}${room.freeUnits === 1 ? " is" : "s are"} free for these dates.`;
    if (quote && !quote.ok && quote.lineIndex === i) return quoteLineMessage(quote.code);
    return null;
  });
}

export type Counter =
  { kind: "placed" } | { kind: "left"; text: string } | { kind: "over"; text: string };

function partyText(p: Party): string {
  const parts = [
    p.adults > 0 ? plural(p.adults, "adult") : null,
    p.children > 0 ? plural(p.children, "child", "children") : null,
  ].filter(Boolean);
  return parts.join(" and ");
}

/** The guests-left counter from the original search. */
export function counter(party: Party, lines: Party[]): Counter {
  const left = guestsLeft(party, lines);
  if (left.adults === 0 && left.children === 0) return { kind: "placed" };
  const missing = { adults: Math.max(left.adults, 0), children: Math.max(left.children, 0) };
  const extra = { adults: Math.max(-left.adults, 0), children: Math.max(-left.children, 0) };
  if (missing.adults + missing.children > 0)
    return { kind: "left", text: `${partyText(missing)} left to place` };
  return { kind: "over", text: `${partyText(extra)} more than your search` };
}

export type ContinueState = { ok: true } | { ok: false; reason: string };

/** Continue only with 1 to 4 valid lines, every guest placed, and a valid quote for this cart. */
export function continueState(input: {
  rooms: RoomOption[];
  lines: CartLine[];
  party: Party;
  quote: CartQuote;
  /** True while the quote for the latest edit is still loading. */
  pending: boolean;
}): ContinueState {
  const { rooms, lines, party, quote, pending } = input;
  if (lines.length === 0) return { ok: false, reason: "Add a room to continue." };
  if (lines.length > MAX_CART_ROOMS)
    return { ok: false, reason: `Book up to ${MAX_CART_ROOMS} rooms online.` };
  if (lineIssues(rooms, lines, quote).some(Boolean))
    return { ok: false, reason: "Fix the rooms marked above to continue." };
  const c = counter(party, lines);
  if (c.kind === "left") return { ok: false, reason: `Place every guest to continue: ${c.text}.` };
  if (c.kind === "over")
    return { ok: false, reason: `Your rooms hold ${c.text}. Remove them or change your search.` };
  if (pending || !quote) return { ok: false, reason: "Updating the price…" };
  if (!quote.ok)
    return { ok: false, reason: "We could not price these rooms. Change them or try again." };
  return { ok: true };
}
