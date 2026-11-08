/**
 * Pure helpers for the room detail page. Types only from the modules, so the client booking
 * panel can import this file without pulling the database client into the browser bundle.
 */
import type { RoomType } from "@/modules/catalog";
import type { Quote, QuoteNight } from "@/modules/pricing";
import { stayHref, type CartLine, type CartStay, type ParsedCart } from "./cart";

export type PlanView = {
  id: string;
  code: "EP" | "CP" | "MAP";
  name: string;
  inclusions: string;
  refundable: boolean;
  quoteHash: string;
  subtotalPaise: number;
  discountPaise: number;
  gstPaise: number;
  totalPaise: number;
  gst: GstLine[];
  /** Per date, summed over the rooms of the cart (display only; GST is per room and night). */
  nights: { date: string; ratePaise: number; discountPaise: number; gstPaise: number }[];
  /** The cart lines this plan was priced for, in cart order. */
  lines: CartLine[];
};

/** `nights` counts room-nights: one per (room, night) cell. */
export type GstLine = { bp: number; paise: number; nights: number };

/** GST grouped by rate (a stay can straddle a slab boundary), lowest rate first. */
export function gstBreakdown(cells: QuoteNight[]): GstLine[] {
  const byRate = new Map<number, GstLine>();
  for (const n of cells) {
    const line = byRate.get(n.gstBp) ?? { bp: n.gstBp, paise: 0, nights: 0 };
    line.paise += n.gstPaise;
    line.nights += 1;
    byRate.set(n.gstBp, line);
  }
  return [...byRate.values()].sort((a, b) => a.bp - b.bp);
}

/** Cells summed per date across rooms, in date order. */
export function nightsByDate(quote: Pick<Quote, "lines">): PlanView["nights"] {
  const byDate = new Map<string, PlanView["nights"][number]>();
  for (const n of quote.lines.flatMap((l) => l.nights)) {
    const d = byDate.get(n.date) ?? { date: n.date, ratePaise: 0, discountPaise: 0, gstPaise: 0 };
    d.ratePaise += n.ratePaise;
    d.discountPaise += n.discountPaise;
    d.gstPaise += n.gstPaise;
    byDate.set(n.date, d);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** 500 -> "5%", 1800 -> "18%", 1250 -> "12.5%" */
export function formatBp(bp: number): string {
  return `${bp / 100}%`;
}

export function toPlanView(plan: RoomType["ratePlans"][number], quote: Quote): PlanView {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    inclusions: plan.inclusions,
    refundable: plan.refundable,
    quoteHash: quote.quoteHash,
    subtotalPaise: quote.subtotalPaise,
    discountPaise: quote.discountPaise,
    gstPaise: quote.gstPaise,
    totalPaise: quote.totalPaise,
    gst: gstBreakdown(quote.lines.flatMap((l) => l.nights)),
    nights: nightsByDate(quote),
    lines: quote.lines.map((l) => ({
      roomTypeId: l.roomTypeId,
      ratePlanId: l.ratePlanId,
      adults: l.adults,
      children: l.children,
    })),
  };
}

/** At or below this many free rooms the page warns "Only N left". */
export const LOW_STOCK = 3;

export type AvailabilityView =
  | { state: "free"; label: string; tone: "success" }
  | { state: "low"; label: string; tone: "warning" }
  | { state: "none"; label: string };

/** What the room page says about the chosen dates, from the free website units. */
export function availabilityView(freeUnits: number): AvailabilityView {
  if (freeUnits < 1) return { state: "none", label: "Not available for these dates" };
  if (freeUnits <= LOW_STOCK)
    return { state: "low", label: `Only ${freeUnits} left`, tone: "warning" };
  return { state: "free", label: "Available for your dates", tone: "success" };
}

/** Where the quiet link under "Add to my stay" goes. */
export type StayNav =
  | { kind: "back"; href: string; label: "Back to my stay" }
  | { kind: "explore"; href: "/#rooms"; label: "Explore more rooms" };

export const EXPLORE_ROOMS: StayNav = {
  kind: "explore",
  href: "/#rooms",
  label: "Explore more rooms",
};

/**
 * A cart in the link wins (even an empty one); without one, the stay saved in this browser.
 * "Back" returns to /rooms with that cart unchanged; with no cart the guest explores from home.
 */
export function stayNav(
  url: { hasCartParam: boolean; stay: CartStay; lines: CartLine[] },
  saved: ParsedCart | null,
): StayNav {
  if (url.hasCartParam)
    return url.lines.length > 0
      ? { kind: "back", href: stayHref(url.stay, url.lines), label: "Back to my stay" }
      : EXPLORE_ROOMS;
  if (!saved || saved.lines.length === 0) return EXPLORE_ROOMS;
  const stay: CartStay =
    saved.checkIn && saved.checkOut && saved.party.adults > 0
      ? { checkIn: saved.checkIn, checkOut: saved.checkOut, ...saved.party }
      : url.stay;
  return { kind: "back", href: stayHref(stay, saved.lines), label: "Back to my stay" };
}

/** Cheapest plan first selected by default. */
export function defaultPlanId(plans: PlanView[]): string | undefined {
  return plans.reduce<PlanView | undefined>(
    (best, p) => (!best || p.totalPaise < best.totalPaise ? p : best),
    undefined,
  )?.id;
}
