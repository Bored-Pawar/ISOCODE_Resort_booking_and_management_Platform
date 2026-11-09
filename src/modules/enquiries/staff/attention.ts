/**
 * Sales attention request (06 decision 2026-11-08, runbook 2.5). Two `enquiry_events` rows, no
 * schema change: request (`rerouted`, from_value = note, to_value = 'attention') and resolve
 * (`rerouted`, from_value = 'attention', to_value = 'seen: ' + reply note).
 */
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { enquiries as e, enquiryEvents } from "@/db/schema";
import { getDb } from "@/lib/db";
import type { Err, Ok } from "@/lib/result";
import { can } from "@/lib/auth/permissions";
import { asEvents, eventsFor, visibilityOf } from "./detail";
import {
  ATTENTION,
  attentionOpen,
  canView,
  canWork,
  isAttentionRequest,
  noteSchema,
  SEEN,
  type InboxActor,
} from "./rules";

export const attentionInputSchema = z
  .object({ enquiryId: z.string().trim().min(1).max(40), note: noteSchema })
  .strict();

type Fail = Err<"INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "ALREADY_OPEN" | "NOT_OPEN">;
const now = sql`clock_timestamp()`;

/** Sales or GM, on an enquiry they can work (not a complaint), when no request is open. */
export async function requestAttention(
  input: unknown,
  actor: InboxActor,
): Promise<Ok<object> | Fail> {
  if (!can(actor.role, "attention.request")) return { ok: false, code: "FORBIDDEN" };
  const parsed = attentionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const { enquiryId: id, note } = parsed.data;
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(e).where(eq(e.id, id)).for("update");
    if (!row) return { ok: false, code: "NOT_FOUND" } as const;
    const vis = visibilityOf(row);
    if (!canWork(actor.role, vis) || vis.isComplaint || vis.category === "complaint")
      return { ok: false, code: "FORBIDDEN" } as const;
    if (attentionOpen(asEvents(await eventsFor(id, tx))))
      return { ok: false, code: "ALREADY_OPEN" } as const;
    await tx.insert(enquiryEvents).values({
      enquiryId: id,
      actor: actor.userId,
      action: "rerouted",
      fromValue: note,
      toValue: ATTENTION,
      at: now as never,
    });
    return { ok: true } as const;
  });
}

/** Reservations or GM mark the open request seen, with a reply note. */
export async function resolveAttention(
  input: unknown,
  actor: InboxActor,
): Promise<Ok<object> | Fail> {
  if (!can(actor.role, "attention.resolve")) return { ok: false, code: "FORBIDDEN" };
  const parsed = attentionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const { enquiryId: id, note } = parsed.data;
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(e).where(eq(e.id, id)).for("update");
    if (!row) return { ok: false, code: "NOT_FOUND" } as const;
    const events = asEvents(await eventsFor(id, tx));
    if (
      !canView(actor.role, {
        ...visibilityOf(row),
        attentionRequested: events.some(isAttentionRequest),
      })
    )
      return { ok: false, code: "NOT_FOUND" } as const;
    if (!attentionOpen(events)) return { ok: false, code: "NOT_OPEN" } as const;
    await tx.insert(enquiryEvents).values({
      enquiryId: id,
      actor: actor.userId,
      action: "rerouted",
      fromValue: ATTENTION,
      toValue: `${SEEN}: ${note}`,
      at: now as never,
    });
    return { ok: true } as const;
  });
}
