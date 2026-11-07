/**
 * Pure helpers for the room detail page. Types only from the modules, so the client booking
 * panel can import this file without pulling the database client into the browser bundle.
 */
import type { RoomType } from "@/modules/catalog";
import type { Quote } from "@/modules/pricing";

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
  nights: { date: string; ratePaise: number; discountPaise: number; gstPaise: number }[];
};

export type GstLine = { bp: number; paise: number; nights: number };

export type BookBase = {
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
};

/** GST grouped by rate (a stay can straddle a slab boundary), lowest rate first. */
export function gstBreakdown(nights: Quote["nights"]): GstLine[] {
  const byRate = new Map<number, GstLine>();
  for (const n of nights) {
    const line = byRate.get(n.gstBp) ?? { bp: n.gstBp, paise: 0, nights: 0 };
    line.paise += n.gstPaise;
    line.nights += 1;
    byRate.set(n.gstBp, line);
  }
  return [...byRate.values()].sort((a, b) => a.bp - b.bp);
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
    gst: gstBreakdown(quote.nights),
    nights: quote.nights.map((n) => ({
      date: n.date,
      ratePaise: n.ratePaise,
      discountPaise: n.discountPaise,
      gstPaise: n.gstPaise,
    })),
  };
}

/** Link to the booking flow (B6). Carries ids and the hash of the price the guest saw. */
export function bookHref(base: BookBase, plan: Pick<PlanView, "id" | "quoteHash">): string {
  const params = new URLSearchParams({
    roomTypeId: base.roomTypeId,
    ratePlanId: plan.id,
    checkIn: base.checkIn,
    checkOut: base.checkOut,
    adults: String(base.adults),
    children: String(base.children),
    quoteHash: plan.quoteHash,
  });
  return `/book?${params.toString()}`;
}

/** Only call out scarcity when it is real and small. */
export function availabilityNote(units: number): { tone: "success" | "warning"; text: string } {
  return units <= 3
    ? {
        tone: "warning",
        text: units === 1 ? "Only 1 left for these dates" : `Only ${units} left for these dates`,
      }
    : { tone: "success", text: "Available for your dates" };
}

/** Cheapest plan first selected by default. */
export function defaultPlanId(plans: PlanView[]): string | undefined {
  return plans.reduce<PlanView | undefined>(
    (best, p) => (!best || p.totalPaise < best.totalPaise ? p : best),
    undefined,
  )?.id;
}
