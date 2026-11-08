import { z } from "zod";
import type { Err, Ok } from "@/lib/result";
import { isDateStr } from "@/lib/dates";

const dateStr = z.string().refine(isDateStr, "Expected a YYYY-MM-DD date");

/** B10: a booking is one order with 1 to 4 room lines (docs/s2-multiroom-change.md section 1). */
export const MAX_ROOMS_PER_BOOKING = 4;

/** One room line of a cart. Every line shares the order's check-in and check-out. */
export const quoteRoomInputSchema = z.object({
  roomTypeId: z.string().min(1),
  ratePlanId: z.string().min(1),
  adults: z.number().int().min(1).max(10),
  children: z.number().int().min(0).max(10).default(0),
});
export type QuoteRoomInput = z.input<typeof quoteRoomInputSchema>;

export const quoteInputSchema = z
  .object({
    checkIn: dateStr,
    checkOut: dateStr,
    promoCode: z.string().trim().min(1).max(32).optional(),
    /** Line order is significant: it is part of quoteHash. Keep it stable from quote to hold. */
    rooms: z.array(quoteRoomInputSchema).min(1).max(MAX_ROOMS_PER_BOOKING),
  })
  .refine((v) => v.checkOut > v.checkIn, {
    message: "checkOut must be after checkIn",
    path: ["checkOut"],
  });
export type QuoteInput = z.input<typeof quoteInputSchema>;
export type ParsedQuoteInput = z.output<typeof quoteInputSchema>;

/** One stay night of one room line. All money in integer paise. */
export type QuoteNight = {
  date: string;
  ratePaise: number;
  /** This cell's share of the promo discount. */
  discountPaise: number;
  /** GST rate in basis points, chosen from the slab for (rate - discount) of this cell. */
  gstBp: number;
  gstPaise: number;
};

export type Promo = { code: string; kind: "pct" | "flat"; value: number };

export type QuoteLine = {
  /** 1-based position in the cart, equal to input index + 1. */
  lineNo: number;
  roomTypeId: string;
  ratePlanId: string;
  adults: number;
  children: number;
  nights: QuoteNight[];
  subtotalPaise: number;
  discountPaise: number;
  gstPaise: number;
  /** subtotal - discount + gst of this line. */
  totalPaise: number;
};

export type Quote = {
  checkIn: string;
  checkOut: string;
  promo: Promo | null;
  lines: QuoteLine[];
  /** Order totals = sum of line totals = sum of cells. Never re-rounded. */
  subtotalPaise: number;
  discountPaise: number;
  gstPaise: number;
  /** subtotal - discount + gst. The only amount a payment may charge. */
  totalPaise: number;
  /** Hash of dates, promo and each line in order (type, plan, nights). See hash.ts. */
  quoteHash: string;
};

/** Errors for one specific line carry its 0-based index into `rooms`. */
export type LineError = { lineIndex?: number };

export type QuoteResult =
  | Ok<{ quote: Quote }>
  | Err<"INVALID_INPUT" | "PROMO_INVALID">
  | Err<"NO_RATE" | "OVER_OCCUPANCY", LineError>;
