/**
 * FROZEN CONTRACT (C1). Stub returns fixtures until R2/R3.
 * Output schema is docs/04-ai-router.md. Routing is deterministic code, never the model.
 */
import { z } from "zod";
import type { Err, Ok } from "@/lib/result";
import { classificationFixtures } from "./fixtures";

export const classificationSchema = z.object({
  category: z.enum(["room", "wedding", "offsite", "complaint", "other"]),
  confidence: z.number().min(0).max(1),
  dates: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    text: z.string().optional(),
  }),
  guests: z.object({
    adults: z.number().int().optional(),
    children: z.number().int().optional(),
    total: z.number().int().optional(),
  }),
  budget: z.object({ amountInr: z.number().optional(), text: z.string().optional() }),
  language: z.string(),
  /** One line for the inbox. */
  summary: z.string(),
});
export type Classification = z.infer<typeof classificationSchema>;

export const processInputSchema = z.object({ enquiryId: z.string().min(1) });
export type ProcessInput = z.input<typeof processInputSchema>;

export type ProcessResult =
  | Ok<{
      /** ok: model result. fallback: rules classifier used (always unsorted). */
      status: "ok" | "fallback";
      classification: Classification;
      lane: "sorted" | "unsorted";
      ownerRole: "reservations" | "sales" | "gm" | null;
      notifyGm: boolean;
    }>
  | Err<"INVALID_INPUT" | "NOT_FOUND" | "FAILED">;

export const aiRouter = {
  async process(input: ProcessInput): Promise<ProcessResult> {
    const parsed = processInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    const hit = classificationFixtures[parsed.data.enquiryId];
    if (!hit) return { ok: false, code: "NOT_FOUND" };
    return { ok: true, ...hit };
  },
};
