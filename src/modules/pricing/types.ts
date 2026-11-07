import { z } from "zod";
import type { Err, Ok } from "@/lib/result";
import { isDateStr } from "@/lib/dates";

const dateStr = z.string().refine(isDateStr, "Expected a YYYY-MM-DD date");

export const quoteInputSchema = z
  .object({
    roomTypeId: z.string().min(1),
    ratePlanId: z.string().min(1),
    checkIn: dateStr,
    checkOut: dateStr,
    adults: z.number().int().min(1).max(10),
    children: z.number().int().min(0).max(10).default(0),
    promoCode: z.string().trim().min(1).max(32).optional(),
  })
  .refine((v) => v.checkOut > v.checkIn, {
    message: "checkOut must be after checkIn",
    path: ["checkOut"],
  });
export type QuoteInput = z.input<typeof quoteInputSchema>;
export type ParsedQuoteInput = z.output<typeof quoteInputSchema>;

/** One stay night. All money in integer paise. */
export type QuoteNight = {
  date: string;
  ratePaise: number;
  /** This night's share of the promo discount. */
  discountPaise: number;
  /** GST rate in basis points, chosen from the slab for (rate - discount). */
  gstBp: number;
  gstPaise: number;
};

export type Quote = {
  roomTypeId: string;
  ratePlanId: string;
  checkIn: string;
  checkOut: string;
  nights: QuoteNight[];
  promo: { code: string; kind: "pct" | "flat"; value: number } | null;
  subtotalPaise: number;
  discountPaise: number;
  gstPaise: number;
  /** subtotal - discount + gst. The only amount a payment may charge. */
  totalPaise: number;
  /** Hash of room type, plan, dates, promo, nightly rates and slabs used. See hash.ts. */
  quoteHash: string;
};

export type QuoteResult =
  Ok<{ quote: Quote }> | Err<"INVALID_INPUT" | "NO_RATE" | "PROMO_INVALID" | "OVER_OCCUPANCY">;
