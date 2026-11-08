/** Q5 detail read. Not found and not visible answer the same, so ids do not leak across roles. */
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { enquiries as e, enquiryEvents, eventDetails, replyDrafts, users } from "@/db/schema";
import { getDb, type Db, type Tx } from "@/lib/db";
import type { Err, Ok } from "@/lib/result";
import { can, type EnquiryCategory, type StaffRole } from "@/lib/auth/permissions";
import {
  attentionOpen,
  canView,
  canWork,
  isAttentionRequest,
  type EventRow,
  type InboxActor,
} from "./rules";
import { toRow, type InboxRow } from "./service";

export type Extracted = {
  dates?: { from?: string; to?: string; text?: string };
  guests?: { adults?: number; children?: number; total?: number };
  budget?: { amountInr?: number; text?: string };
  room?: string;
  language?: string;
  summary?: string;
  grounding?: { dates?: string; guests?: string; room?: string };
  staffEdited?: string[];
  guest_hint?: string;
};

export type Draft = {
  id: string;
  body: string;
  quote: unknown;
  edited: boolean;
  approvedBy: string | null;
  sentAt: string | null;
  provider: string;
};

export type TimelineEntry = {
  id: string;
  at: string;
  actor: string;
  action: string;
  fromValue: string | null;
  toValue: string | null;
};

export type StaffUser = { id: string; name: string; role: StaffRole };

export type InboxDetail = {
  enquiry: InboxRow & {
    rawText: string;
    senderContact: string;
    ownerId: string | null;
    aiAttempts: number;
    aiLastError: string | null;
    aiUpdatedAt: string;
  };
  extracted: Extracted;
  draft: Draft | null;
  event: {
    eventType: string;
    dateFrom: string | null;
    dateTo: string | null;
    guests: number | null;
    budgetPaise: number | null;
    needs: unknown;
  } | null;
  timeline: TimelineEntry[];
  attentionOpen: boolean;
  staff: StaffUser[];
  can: {
    work: boolean;
    retry: boolean;
    requestAttention: boolean;
    resolveAttention: boolean;
  };
};

const STAFF: StaffRole[] = ["reservations", "sales", "gm"];

/** Staff accounts in default-owner order (`created_at, id`, the same order R2 assigns with). */
export async function staffUsers(db: Db | Tx = getDb()): Promise<StaffUser[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(inArray(users.role, STAFF))
    .orderBy(asc(users.createdAt), asc(users.id));
  return rows as StaffUser[];
}

export async function eventsFor(id: string, db: Db | Tx = getDb()): Promise<TimelineEntry[]> {
  const rows = await db
    .select({
      id: enquiryEvents.id,
      at: enquiryEvents.at,
      actor: enquiryEvents.actor,
      actorName: users.name,
      action: enquiryEvents.action,
      fromValue: enquiryEvents.fromValue,
      toValue: enquiryEvents.toValue,
    })
    .from(enquiryEvents)
    .leftJoin(users, sql`${users.id}::text = ${enquiryEvents.actor}`)
    .where(eq(enquiryEvents.enquiryId, id))
    .orderBy(desc(enquiryEvents.at), desc(enquiryEvents.id));
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    actor:
      r.actorName ??
      (r.actor === "ai-router" || r.actor === "ai"
        ? "AI"
        : r.actor === "rules"
          ? "Rules"
          : r.actor),
    action: r.action,
    fromValue: r.fromValue,
    toValue: r.toValue,
  }));
}

export const asEvents = (t: TimelineEntry[]): EventRow[] =>
  t.map((x) => ({ action: x.action, fromValue: x.fromValue, toValue: x.toValue, at: x.at }));

export function visibilityOf(r: typeof e.$inferSelect) {
  return {
    category: r.category as EnquiryCategory | null,
    lane: r.lane as "sorted" | "unsorted",
    isComplaint: r.isComplaint,
  };
}

export async function getDetail(
  id: string,
  actor: InboxActor,
): Promise<Ok<{ detail: InboxDetail }> | Err<"NOT_FOUND">> {
  const db = getDb();
  const [found] = await db
    .select({ r: e, ownerName: users.name })
    .from(e)
    .leftJoin(users, eq(users.id, e.ownerId))
    .where(eq(e.id, id))
    .limit(1);
  if (!found) return { ok: false, code: "NOT_FOUND" };
  const timeline = await eventsFor(id, db);
  const events = asEvents(timeline);
  const vis = visibilityOf(found.r);
  const attentionRequested = events.some(isAttentionRequest);
  if (!canView(actor.role, { ...vis, attentionRequested })) return { ok: false, code: "NOT_FOUND" };
  const work = canWork(actor.role, vis);
  const [[draft], [event], staff] = await Promise.all([
    db
      .select()
      .from(replyDrafts)
      .where(eq(replyDrafts.enquiryId, id))
      .orderBy(sql`${replyDrafts.sentAt} DESC NULLS FIRST`)
      .limit(1),
    db.select().from(eventDetails).where(eq(eventDetails.enquiryId, id)).limit(1),
    work ? staffUsers(db) : Promise.resolve([] as StaffUser[]),
  ]);
  const r = found.r;
  const open = attentionOpen(events);
  return {
    ok: true,
    detail: {
      enquiry: {
        ...toRow(r, found.ownerName),
        rawText: r.rawText,
        senderContact: r.senderContact,
        ownerId: r.ownerId,
        aiAttempts: r.aiAttempts,
        aiLastError: r.aiLastError,
        aiUpdatedAt: r.aiUpdatedAt.toISOString(),
      },
      extracted: (r.extracted ?? {}) as Extracted,
      draft: draft
        ? {
            id: draft.id,
            body: draft.body,
            quote: draft.quote,
            edited: draft.edited,
            approvedBy: draft.approvedBy,
            sentAt: draft.sentAt?.toISOString() ?? null,
            provider: draft.provider,
          }
        : null,
      event: event
        ? {
            eventType: event.eventType,
            dateFrom: event.dateFrom,
            dateTo: event.dateTo,
            guests: event.guests,
            budgetPaise: event.budgetPaise,
            needs: event.needs,
          }
        : null,
      timeline,
      attentionOpen: open,
      staff,
      can: {
        work,
        retry:
          can(actor.role, "enquiries.unsorted") &&
          r.aiStatus === "failed" &&
          r.aiLastError === "ATTEMPTS_EXHAUSTED",
        requestAttention: work && can(actor.role, "attention.request") && !open,
        resolveAttention: can(actor.role, "attention.resolve") && open,
      },
    },
  };
}
