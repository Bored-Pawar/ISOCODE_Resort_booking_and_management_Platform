/**
 * Q6 draft and send. The ONLY code that sets `reply_drafts.sent_at` is `approveAndSend`, and it
 * needs a staff actor who can work the enquiry (runbook hard rule 2). "Send" means the mock outbox:
 * nothing goes to email or WhatsApp.
 */
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { enquiries as e, enquiryEvents, replyDrafts, users } from "@/db/schema";
import { getDb } from "@/lib/db";
import { formatInr } from "@/lib/money";
import type { Err, Ok } from "@/lib/result";
import type { EnquiryChannel } from "../types";
import { visibilityOf } from "./detail";
import { redraft } from "./drafting";
import { workSql } from "./queries";
import { draftVersion } from "./version";
import { addsNewPrice, canWork, type InboxActor } from "./rules";

const enquiryId = z.string().trim().min(1).max(40);
const body = z.string().trim().min(1, "Write a reply.").max(5000);

/** The draft version the client loaded (`draftVersion`). */
const version = z.string().regex(/^[0-9a-f]{16}$/);

export const saveDraftInputSchema = z.object({ enquiryId, body, version }).strict();
export const sendInputSchema = z.object({ enquiryId, draftId: z.uuid(), body, version }).strict();
export const enquiryInputSchema = z.object({ enquiryId }).strict();

type Fail = Err<
  "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "ALREADY_SENT" | "NO_DRAFT" | "STALE_DRAFT"
>;

/** Rupee figures the server quote supplies; anything else in a reply is a staff-typed price. */
export function quoteFigures(quote: unknown): string {
  const q = quote as { totalPaise?: unknown; gstPaise?: unknown } | null;
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? formatInr(v) : "");
  return q ? `${n(q.totalPaise)} ${n(q.gstPaise)}` : "";
}

/** Save an edited draft. A new rupee figure is allowed but logged (`draft:price-warning`). */
export async function saveDraft(
  input: unknown,
  actor: InboxActor,
): Promise<Ok<{ priceWarning: boolean }> | Fail> {
  const parsed = saveDraftInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const { enquiryId: id, body: text, version: seen } = parsed.data;
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(e).where(eq(e.id, id)).for("update");
    if (!row) return { ok: false, code: "NOT_FOUND" } as const;
    if (!canWork(actor.role, visibilityOf(row))) return { ok: false, code: "FORBIDDEN" } as const;
    const [draft] = await tx
      .select()
      .from(replyDrafts)
      .where(eq(replyDrafts.enquiryId, id))
      .orderBy(sql`${replyDrafts.sentAt} DESC NULLS FIRST`)
      .limit(1)
      .for("update");
    if (!draft) return { ok: false, code: "NO_DRAFT" } as const;
    if (draft.sentAt) return { ok: false, code: "ALREADY_SENT" } as const;
    if (draftVersion(draft.body, draft.quote) !== seen)
      return { ok: false, code: "STALE_DRAFT" } as const;
    const priceWarning = addsNewPrice(quoteFigures(draft.quote), text);
    if (text === draft.body) return { ok: true, priceWarning } as const;
    await tx
      .update(replyDrafts)
      .set({ body: text, edited: true })
      .where(eq(replyDrafts.id, draft.id));
    await tx.insert(enquiryEvents).values({
      enquiryId: id,
      actor: actor.userId,
      action: "edited",
      fromValue: "draft",
      toValue: priceWarning ? "draft:price-warning" : "draft",
    });
    return { ok: true, priceWarning } as const;
  });
}

/** Regenerate: R4 again (new prose from the model, same classification, server quote). */
export async function regenerateDraft(
  input: unknown,
  actor: InboxActor,
): Promise<Ok<object> | Fail> {
  const parsed = enquiryInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const id = parsed.data.enquiryId;
  const [row] = await getDb().select().from(e).where(eq(e.id, id)).limit(1);
  if (!row) return { ok: false, code: "NOT_FOUND" };
  if (!canWork(actor.role, visibilityOf(row))) return { ok: false, code: "FORBIDDEN" };
  const done = await redraft(id, true);
  if (done === "missing") return { ok: false, code: "NOT_FOUND" };
  if (done === "locked") return { ok: false, code: "ALREADY_SENT" };
  await getDb().insert(enquiryEvents).values({
    enquiryId: id,
    actor: actor.userId,
    action: "edited",
    fromValue: "draft",
    toValue: "draft:regenerated",
  });
  return { ok: true };
}

/**
 * Approve and send, once. Enquiry row then draft row locked; a second (or concurrent) call finds
 * `sent_at` set and gets ALREADY_SENT. Writes approver, sent time, `edited`, first reply time (only
 * when empty), status `replied` and one `sent` event together.
 */
export async function approveAndSend(
  input: unknown,
  actor: InboxActor,
): Promise<Ok<{ sentAt: string; channel: EnquiryChannel }> | Fail> {
  const parsed = sendInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const { enquiryId: id, draftId, body: text, version: seen } = parsed.data;
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(e).where(eq(e.id, id)).for("update");
    if (!row) return { ok: false, code: "NOT_FOUND" } as const;
    if (!canWork(actor.role, visibilityOf(row))) return { ok: false, code: "FORBIDDEN" } as const;
    const [draft] = await tx
      .select()
      .from(replyDrafts)
      .where(and(eq(replyDrafts.id, draftId), eq(replyDrafts.enquiryId, id)))
      .for("update");
    if (!draft) return { ok: false, code: "NO_DRAFT" } as const;
    if (draft.sentAt) return { ok: false, code: "ALREADY_SENT" } as const;
    // The body and quote the sender reviewed must still be the stored ones: a rebuild (new
    // quote) or another staff member's save since the page loaded refuses the send.
    if (draftVersion(draft.body, draft.quote) !== seen)
      return { ok: false, code: "STALE_DRAFT" } as const;
    const [sent] = await tx
      .update(replyDrafts)
      .set({
        body: text,
        edited: draft.edited || text !== draft.body,
        approvedBy: actor.userId,
        sentAt: sql`clock_timestamp()`,
      })
      .where(and(eq(replyDrafts.id, draft.id), sql`${replyDrafts.sentAt} IS NULL`))
      .returning({ sentAt: replyDrafts.sentAt });
    if (!sent?.sentAt) return { ok: false, code: "ALREADY_SENT" } as const;
    await tx
      .update(e)
      .set({
        firstReplyAt: sql`COALESCE(${e.firstReplyAt}, ${sent.sentAt.toISOString()}::timestamptz)`,
        status: "replied",
      })
      .where(eq(e.id, id));
    // Edits made in the send dialog without "Save draft" are logged like a save (hard rule 3).
    if (text !== draft.body)
      await tx.insert(enquiryEvents).values({
        enquiryId: id,
        actor: actor.userId,
        action: "edited",
        fromValue: "draft",
        toValue: addsNewPrice(quoteFigures(draft.quote), text) ? "draft:price-warning" : "draft",
      });
    await tx.insert(enquiryEvents).values({
      enquiryId: id,
      actor: actor.userId,
      action: "sent",
      fromValue: "draft",
      toValue: row.channel,
    });
    return {
      ok: true,
      sentAt: sent.sentAt.toISOString(),
      channel: row.channel as EnquiryChannel,
    } as const;
  });
}

/** Close: status `closed`, one `closed` event. */
export async function closeEnquiry(input: unknown, actor: InboxActor): Promise<Ok<object> | Fail> {
  const parsed = enquiryInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const id = parsed.data.enquiryId;
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(e).where(eq(e.id, id)).for("update");
    if (!row) return { ok: false, code: "NOT_FOUND" } as const;
    if (!canWork(actor.role, visibilityOf(row))) return { ok: false, code: "FORBIDDEN" } as const;
    if (row.status === "closed") return { ok: true } as const;
    await tx.update(e).set({ status: "closed" }).where(eq(e.id, id));
    await tx.insert(enquiryEvents).values({
      enquiryId: id,
      actor: actor.userId,
      action: "closed",
      fromValue: row.status,
      toValue: "closed",
    });
    return { ok: true } as const;
  });
}

export type SentReply = {
  enquiryId: string;
  senderName: string;
  senderContact: string;
  channel: EnquiryChannel;
  body: string;
  sentAt: string;
  approvedBy: string | null;
  edited: boolean;
};

/** Mock outbox "Replies": derived from `reply_drafts` (no table), within the role's own lanes. */
export async function listSentReplies(actor: InboxActor, limit = 20): Promise<SentReply[]> {
  const rows = await getDb()
    .select({
      enquiryId: e.id,
      senderName: e.senderName,
      senderContact: e.senderContact,
      channel: e.channel,
      body: replyDrafts.body,
      sentAt: replyDrafts.sentAt,
      approvedBy: users.name,
      edited: replyDrafts.edited,
    })
    .from(replyDrafts)
    .innerJoin(e, eq(e.id, replyDrafts.enquiryId))
    .leftJoin(users, eq(users.id, replyDrafts.approvedBy))
    .where(and(isNotNull(replyDrafts.sentAt), workSql(actor.role)))
    .orderBy(desc(replyDrafts.sentAt))
    .limit(Math.min(Math.max(limit, 1), 50));
  return rows.map((r) => ({
    ...r,
    channel: r.channel as EnquiryChannel,
    sentAt: r.sentAt!.toISOString(),
  }));
}
