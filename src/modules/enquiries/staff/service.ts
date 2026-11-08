/**
 * Staff inbox service (Q4 to Q7). Every call takes the verified actor from the page or action
 * (which already ran `requirePermission`) and checks the role again here: lanes against
 * `lanesFor`, rows against `workSql` / `viewSql` inside the query.
 */
import { and, desc, eq, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { enquiries as e, users } from "@/db/schema";
import { getDb } from "@/lib/db";
import type { Err, Ok } from "@/lib/result";
import type { EnquiryCategory } from "@/lib/auth/permissions";
import { scheduleProcessing } from "../scheduling";
import type { AiStatus, EnquiryChannel } from "../types";
import {
  badgeLanesFor,
  lanesFor,
  listInputSchema,
  PAGE_SIZE,
  type InboxActor,
  type Lane,
} from "./rules";
import { laneSql, viewSql } from "./queries";

export type Grounding = { dates?: string; guests?: string; room?: string };

export type InboxRow = {
  id: string;
  senderName: string;
  summary: string;
  category: EnquiryCategory | null;
  channel: EnquiryChannel;
  confidence: number | null;
  isComplaint: boolean;
  aiStatus: AiStatus;
  lane: "sorted" | "unsorted";
  status: "new" | "assigned" | "replied" | "closed";
  grounding: Grounding | null;
  receivedAt: string;
  firstReplyAt: string | null;
  ownerName: string | null;
};

export type InboxPage = { rows: InboxRow[]; nextCursor: string | null };
export type LaneCounts = Partial<Record<Lane, number>>;

const summaryOf = (extracted: unknown) => {
  const s = (extracted as { summary?: unknown } | null)?.summary;
  return typeof s === "string" && s.trim() ? s : "Staff review required";
};
const groundingOf = (extracted: unknown): Grounding | null => {
  const g = (extracted as { grounding?: unknown } | null)?.grounding;
  return g && typeof g === "object" ? (g as Grounding) : null;
};

export function toRow(r: typeof e.$inferSelect, ownerName: string | null): InboxRow {
  return {
    id: r.id,
    senderName: r.senderName,
    summary: summaryOf(r.extracted),
    category: r.category as EnquiryCategory | null,
    channel: r.channel as EnquiryChannel,
    confidence: r.confidence === null ? null : Number(r.confidence),
    isComplaint: r.isComplaint,
    aiStatus: r.aiStatus as AiStatus,
    lane: r.lane as InboxRow["lane"],
    status: r.status as InboxRow["status"],
    grounding: groundingOf(r.extracted),
    receivedAt: r.receivedAt.toISOString(),
    firstReplyAt: r.firstReplyAt?.toISOString() ?? null,
    ownerName,
  };
}

/** Q4 list: one lane, filters, 25 per page, newest first, visibility in SQL. */
export async function listInbox(
  input: unknown,
  actor: InboxActor,
): Promise<Ok<InboxPage> | Err<"FORBIDDEN" | "INVALID_INPUT">> {
  const parsed = listInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const f = parsed.data;
  if (!lanesFor(actor.role).includes(f.lane)) return { ok: false, code: "FORBIDDEN" };
  // R2: inbox loads run the bounded stuck-row sweep (five rows, after the response).
  scheduleProcessing();
  const where: SQL[] = [viewSql(actor.role), laneSql(f.lane, actor.userId)];
  if (f.status) where.push(eq(e.status, f.status));
  if (f.channel) where.push(eq(e.channel, f.channel));
  if (f.q)
    where.push(ilike(sql`(${e.extracted} ->> 'summary')`, `%${f.q.replace(/[%_\\]/g, "\\$&")}%`));
  if (f.cursor) {
    const [at, id] = f.cursor.split("|");
    const when = new Date(at);
    where.push(or(lt(e.receivedAt, when), and(eq(e.receivedAt, when), lt(e.id, id)))!);
  }
  const rows = await getDb()
    .select({ r: e, ownerName: users.name })
    .from(e)
    .leftJoin(users, eq(users.id, e.ownerId))
    .where(and(...where))
    .orderBy(desc(e.receivedAt), desc(e.id))
    .limit(PAGE_SIZE + 1);
  const page = rows.slice(0, PAGE_SIZE).map(({ r, ownerName }) => toRow(r, ownerName));
  const last = page.at(-1);
  return {
    ok: true,
    rows: page,
    nextCursor: rows.length > PAGE_SIZE && last ? `${last.receivedAt}|${last.id}` : null,
  };
}

/** Count badges (Unsorted, Complaints, Needs attention): open items only, one query. */
/**
 * Open (not closed) counts per lane. Default: the badge lanes. `only` asks for other lanes (the
 * `/admin` overview); it is cut to the lanes the role may open, and rows to `viewSql`.
 */
export async function laneCounts(actor: InboxActor, only?: readonly Lane[]): Promise<LaneCounts> {
  const allowed = lanesFor(actor.role);
  const lanes = only ? only.filter((l) => allowed.includes(l)) : badgeLanesFor(actor.role);
  if (!lanes.length) return {};
  const cols = lanes.map(
    (l) => sql`count(*) FILTER (WHERE ${laneSql(l, actor.userId)})::int AS ${sql.identifier(l)}`,
  );
  const [row] = (await getDb().execute(
    sql`SELECT ${sql.join(cols, sql`, `)} FROM ${e}
      WHERE ${viewSql(actor.role)} AND ${e.status} <> 'closed'`,
  )) as unknown as Record<string, number>[];
  return Object.fromEntries(lanes.map((l) => [l, Number(row?.[l] ?? 0)]));
}
