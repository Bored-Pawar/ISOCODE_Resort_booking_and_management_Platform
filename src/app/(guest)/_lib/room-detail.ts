/**
 * Pure helpers for the room detail page. Types only from the modules, so the client booking
 * panel can import this file without pulling the database client into the browser bundle.
 */
import type { RoomType } from "@/modules/catalog";
import type { Quote, QuoteNight } from "@/modules/pricing";
import type { CartLine } from "./cart";

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

/** Cheapest plan first selected by default. */
export function defaultPlanId(plans: PlanView[]): string | undefined {
  return plans.reduce<PlanView | undefined>(
    (best, p) => (!best || p.totalPaise < best.totalPaise ? p : best),
    undefined,
  )?.id;
}
