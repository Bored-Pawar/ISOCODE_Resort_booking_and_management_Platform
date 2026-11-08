/**
 * B6 step 2: what happens after "Hold my rooms". Pure (types only from modules) so the server
 * action, the pages and the tests share one mapping from a hold result to the next screen.
 */
import type { AcquireBookingHoldResult } from "@/modules/booking/actions";
import { stayHref, type CartLine, type CartStay } from "./cart";

// ---- /rooms notices --------------------------------------------------------

/**
 * Why the guest was sent back to /rooms. Carried as the `notice` URL param:
 * `sold-out` or `sold-out.<roomTypeId>`, `blackout`, `line.<index>.<NO_RATE|OVER_OCCUPANCY>`.
 * Display only: the stay builder re-checks stock and prices itself.
 */
export type RoomsNotice =
  | { kind: "sold-out"; roomTypeId?: string }
  | { kind: "blackout" }
  | { kind: "line"; lineIndex: number; code: "NO_RATE" | "OVER_OCCUPANCY" };

const ID = /^[0-9A-Za-z-]{1,64}$/;

export function encodeNotice(n: RoomsNotice): string {
  if (n.kind === "sold-out") return n.roomTypeId ? `sold-out.${n.roomTypeId}` : "sold-out";
  if (n.kind === "blackout") return "blackout";
  return `line.${n.lineIndex}.${n.code}`;
}

export function parseNotice(raw: string | string[] | undefined): RoomsNotice | null {
  const v = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  if (v === "sold-out") return { kind: "sold-out" };
  if (v === "blackout") return { kind: "blackout" };
  const sold = /^sold-out\.(.+)$/.exec(v);
  if (sold && ID.test(sold[1])) return { kind: "sold-out", roomTypeId: sold[1] };
  const line = /^line\.([0-3])\.(NO_RATE|OVER_OCCUPANCY)$/.exec(v);
  if (line)
    return {
      kind: "line",
      lineIndex: Number(line[1]),
      code: line[2] as "NO_RATE" | "OVER_OCCUPANCY",
    };
  return null;
}

/** The banner text for a notice; room cards and lines repeat it next to the room at fault. */
export function noticeMessage(n: RoomsNotice): string {
  switch (n.kind) {
    case "sold-out":
      return "Sorry, a room in your stay was just taken by another guest. Choose another room and try again.";
    case "blackout":
      return "One of your rooms is closed on these dates. Choose another room or other dates.";
    case "line":
      return n.code === "NO_RATE"
        ? "We have no price for this room and plan on these dates any more. Choose another plan or room."
        : "Too many guests for this room. Move someone to another room.";
  }
}

export function roomsHrefWithNotice(
  stay: CartStay,
  lines: CartLine[],
  notice: RoomsNotice | null,
): string {
  const href = stayHref(stay, lines);
  return notice ? `${href}&notice=${encodeURIComponent(encodeNotice(notice))}` : href;
}

// ---- hold outcome ----------------------------------------------------------

export type HoldStep =
  /** Held: go and pay. */
  | { kind: "pay"; ref: string }
  /** No stock was taken. Show both totals; "Continue at ₹x" resubmits with the new hash. */
  | { kind: "price-changed"; totalPaise: number; gstPaise: number; quoteHash: string }
  /** Back to the stay builder with the cart (and why). */
  | { kind: "rooms"; href: string }
  /** Online check-in is at most 3 months ahead. */
  | { kind: "window"; message: string }
  /** Something about the request was wrong: inline ErrorState with Retry. */
  | { kind: "error" };

export function holdStep(
  result: AcquireBookingHoldResult,
  stay: CartStay,
  lines: CartLine[],
): HoldStep {
  if (result.ok) return { kind: "pay", ref: result.booking.ref };
  switch (result.code) {
    case "PRICE_CHANGED":
      return {
        kind: "price-changed",
        totalPaise: result.quote.totalPaise,
        gstPaise: result.quote.gstPaise,
        quoteHash: result.quote.quoteHash,
      };
    case "SOLD_OUT":
      return {
        kind: "rooms",
        href: roomsHrefWithNotice(stay, lines, { kind: "sold-out", roomTypeId: result.roomTypeId }),
      };
    case "BLACKOUT":
      return { kind: "rooms", href: roomsHrefWithNotice(stay, lines, { kind: "blackout" }) };
    case "NO_RATE":
    case "OVER_OCCUPANCY":
      return {
        kind: "rooms",
        href: roomsHrefWithNotice(
          stay,
          lines,
          result.lineIndex === undefined
            ? null
            : { kind: "line", lineIndex: result.lineIndex, code: result.code },
        ),
      };
    case "PROMO_INVALID":
      // The stay builder re-prices with the code and shows the field error itself.
      return { kind: "rooms", href: roomsHrefWithNotice(stay, lines, null) };
    case "OUTSIDE_WINDOW":
      return { kind: "window", message: result.message };
    case "INVALID_INPUT":
      return { kind: "error" };
  }
}
