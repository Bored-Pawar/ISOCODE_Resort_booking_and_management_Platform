/**
 * Zod schemas for every admin write (A1 to A4). The services parse with these again, so a server
 * action and a direct service call get the same validation. Window checks (not in the past, not
 * past the seeded horizon) need "today", so they are applied by `withinWindow` at call time.
 */
import { z } from "zod";
import { isDateStr } from "@/lib/dates";

export const MAX_RATE_RUPEES = 500_000;
export const MAX_FLAT_PROMO_RUPEES = 500_000;
/** Cells per single-edit request (one grid page is 4 rooms x 3 plans x 30 days = 360). */
export const MAX_CELLS = 400;

const dateStr = z.string().refine(isDateStr, "Enter a date as YYYY-MM-DD.");
const uuid = z.uuid();
const days = z
  .array(z.number().int().min(0).max(6))
  .min(1, "Pick at least one day of the week.")
  .max(7)
  .refine((d) => new Set(d).size === d.length, "Days repeat.");
export const planCode = z.enum(["EP", "CP", "MAP"]);
export type PlanCode = z.infer<typeof planCode>;

const rupees = z
  .number({ error: "Enter a price in rupees." })
  .int("Use whole rupees.")
  .min(1, "Price must be more than ₹0.")
  .max(MAX_RATE_RUPEES, "At most ₹5,00,000 a night.");

const rangeFields = { from: dateStr, to: dateStr, days };
const rangeOrdered = {
  check: (v: { from: string; to: string }) => v.to >= v.from,
  params: { message: "End date is before the start date.", path: ["to"] },
};

// ---- A1 rates ----------------------------------------------------------------------------------

export const rateCellSchema = z.object({
  roomTypeId: uuid,
  ratePlanId: uuid,
  date: dateStr,
  rupees,
});

export const setRatesInputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("cells"),
    cells: z
      .array(rateCellSchema)
      .min(1)
      .max(MAX_CELLS)
      .refine(
        (cells) =>
          new Set(cells.map((c) => `${c.roomTypeId}|${c.ratePlanId}|${c.date}`)).size ===
          cells.length,
        "A cell appears twice.",
      ),
  }),
  z
    .object({
      mode: z.literal("range"),
      roomTypeIds: z.array(uuid).min(1, "Pick at least one room type.").max(20),
      planCodes: z.array(planCode).min(1, "Pick at least one plan.").max(3),
      rupees,
      ...rangeFields,
    })
    .refine(rangeOrdered.check, rangeOrdered.params),
]);
export type SetRatesInput = z.input<typeof setRatesInputSchema>;

// ---- A2 allotment ------------------------------------------------------------------------------

const allotment = z
  .number({ error: "Enter a number of rooms." })
  .int("Use a whole number.")
  .min(0, "Allotment cannot be negative.")
  .max(1000);

export const setAllotmentInputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("cells"),
    cells: z
      .array(z.object({ roomTypeId: uuid, date: dateStr, allotment }))
      .min(1)
      .max(MAX_CELLS)
      .refine(
        (cells) => new Set(cells.map((c) => `${c.roomTypeId}|${c.date}`)).size === cells.length,
        "A cell appears twice.",
      ),
  }),
  z
    .object({
      mode: z.literal("range"),
      roomTypeIds: z.array(uuid).min(1, "Pick at least one room type.").max(20),
      allotment,
      ...rangeFields,
    })
    .refine(rangeOrdered.check, rangeOrdered.params),
]);
export type SetAllotmentInput = z.input<typeof setAllotmentInputSchema>;

// ---- A3 online / offline -----------------------------------------------------------------------

const offlineScope = {
  /** null = all room types. */
  roomTypeId: uuid.nullable(),
  from: dateStr,
  to: dateStr,
};
const orderedRange = (v: { from: string; to: string }) => v.to >= v.from;

export const setOfflineInputSchema = z
  .object({
    ...offlineScope,
    reason: z
      .string()
      .trim()
      .min(3, "Give a reason guests and staff will understand (3 characters or more).")
      .max(200, "Keep the reason under 200 characters."),
  })
  .refine(orderedRange, { message: "End date is before the start date.", path: ["to"] });
export type SetOfflineInput = z.input<typeof setOfflineInputSchema>;

export const setOnlineInputSchema = z
  .object(offlineScope)
  .refine(orderedRange, { message: "End date is before the start date.", path: ["to"] });
export type SetOnlineInput = z.input<typeof setOnlineInputSchema>;

// ---- A4 promos ---------------------------------------------------------------------------------

export const promoCodeText = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,20}$/, "Use 3 to 20 letters or digits, no spaces.");

export const createPromoInputSchema = z
  .object({
    code: promoCodeText,
    kind: z.enum(["pct", "flat"]),
    /** Percent (1 to 100) for pct, whole rupees for flat. */
    value: z.number({ error: "Enter a value." }).int("Use a whole number."),
    validFrom: dateStr,
    validTo: dateStr,
    minNights: z
      .number({ error: "Enter minimum nights." })
      .int()
      .min(1, "At least 1 night.")
      .max(14, "At most 14 nights."),
    /** null = unlimited. */
    maxUses: z.number().int("Use a whole number.").min(1, "At least 1, or leave empty.").nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "pct" && (v.value < 1 || v.value > 100))
      ctx.addIssue({ code: "custom", path: ["value"], message: "Percent must be 1 to 100." });
    if (v.kind === "flat" && (v.value < 1 || v.value > MAX_FLAT_PROMO_RUPEES))
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Flat discount must be ₹1 to ₹5,00,000.",
      });
    if (v.validTo < v.validFrom)
      ctx.addIssue({
        code: "custom",
        path: ["validTo"],
        message: "Valid to is before valid from.",
      });
  });
export type CreatePromoInput = z.input<typeof createPromoInputSchema>;

export const deactivatePromoInputSchema = z.object({ id: uuid });

/** First issue per field, for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "form";
    out[key] ??= issue.message;
  }
  return out;
}
