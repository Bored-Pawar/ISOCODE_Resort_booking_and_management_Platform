import { z } from "zod";
import { isDateStr } from "@/lib/dates";
const date = z.string().refine(isDateStr, "Expected calendar date YYYY-MM-DD");
export const classificationSchema = z.object({
  category: z.enum(["room", "wedding", "offsite", "complaint", "other"]),
  confidence: z.number().min(0).max(1),
  dates: z
    .object({ from: date.optional(), to: date.optional(), text: z.string().max(200).optional() })
    .refine((v) => !v.from || !v.to || v.to > v.from, "Reversed dates"),
  guests: z
    .object({
      adults: z.number().int().nonnegative().max(10000).optional(),
      children: z.number().int().nonnegative().max(10000).optional(),
      total: z.number().int().nonnegative().max(10000).optional(),
    })
    .refine(
      (v) =>
        v.total === undefined ||
        v.adults === undefined ||
        v.children === undefined ||
        v.total === v.adults + v.children,
      "Inconsistent party",
    ),
  budget: z.object({
    amountInr: z.number().nonnegative().max(1_000_000_000).optional(),
    text: z.string().max(200).optional(),
  }),
  language: z.string().trim().min(1).max(40),
  summary: z.string().trim().min(1).max(500),
});
export type Classification = z.infer<typeof classificationSchema>;
// Draft safety is checked independently after classification, so unsafe prose doesn't downgrade ok.
export const modelResponseSchema = classificationSchema.extend({
  draftText: z.string().nullish().catch(null),
});
