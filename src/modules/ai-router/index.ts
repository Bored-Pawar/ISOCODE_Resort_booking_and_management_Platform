/**
 * FROZEN CONTRACT (C1). Persistent processing since R2–R4.
 * Output schema is docs/04-ai-router.md. Routing is deterministic code, never the model.
 */
import { z } from "zod";
import type { Err, Ok } from "@/lib/result";
import { processEnquiry } from "./processing";
export { classificationSchema } from "./schema";
export type { Classification } from "./schema";
import type { Classification } from "./schema";
export { recoverEnquiries } from "./recovery";

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
    return processEnquiry(input);
  },
};
