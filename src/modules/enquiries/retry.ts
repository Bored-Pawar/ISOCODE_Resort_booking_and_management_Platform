import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { enquiries as table } from "@/db/schema";
import { getDb } from "@/lib/db";
import { resetFailedEnquiry } from "./internal";
import { scheduleProcessing } from "./scheduling";

export const retryInputSchema = z
  .object({
    enquiryId: z.string().min(1).max(100),
    expectedUpdatedAt: z.iso.datetime(),
    expectedAttempts: z.number().int().min(3),
  })
  .strict();
export async function retryEnquiry(input: unknown) {
  const { requireRole } = await import("@/lib/auth");
  const actor = await requireRole("reservations", "sales", "gm");
  const parsed = retryInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT" as const };
  const reset = await resetFailedEnquiry(parsed.data, actor.id);
  if (!reset) return { ok: false as const, code: "STALE_OR_PROTECTED" as const };
  scheduleProcessing(parsed.data.enquiryId);
  return { ok: true as const };
}

/** Additive read for the recovery UI; the frozen Enquiry list shape remains unchanged. */
export async function listReviewQueue() {
  const { requireRole } = await import("@/lib/auth");
  await requireRole("reservations", "sales", "gm");
  scheduleProcessing();
  const rows = await getDb()
    .select()
    .from(table)
    .where(eq(table.lane, "unsorted"))
    .orderBy(desc(table.receivedAt), desc(table.id))
    .limit(50);
  return rows.map((row) => ({
    id: row.id,
    senderName: row.senderName,
    summary: (row.extracted as { summary?: string } | null)?.summary ?? "Staff review required",
    aiStatus: row.aiStatus,
    aiAttempts: row.aiAttempts,
    aiLastError: row.aiLastError,
    updatedAt: row.aiUpdatedAt.toISOString(),
    grounding: (row.extracted as { grounding?: Record<string, string> } | null)?.grounding ?? null,
    canRetry:
      row.aiStatus === "failed" &&
      row.aiLastError === "ATTEMPTS_EXHAUSTED" &&
      row.status === "new" &&
      !row.ownerId &&
      !row.firstReplyAt,
  }));
}
