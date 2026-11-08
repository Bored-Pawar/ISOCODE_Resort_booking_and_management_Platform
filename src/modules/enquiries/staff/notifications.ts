/**
 * Q7 GM bell. Every read and write is scoped to `user_id = me` and needs `notifications.gm`; the
 * rows themselves are written by R2/R3 settlement and by a re-route into a complaint.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { enquiries as e, notifications as n } from "@/db/schema";
import { getDb } from "@/lib/db";
import type { Err, Ok } from "@/lib/result";
import { can } from "@/lib/auth/permissions";
import type { InboxActor } from "./rules";

export type BellItem = {
  id: string;
  enquiryId: string;
  kind: "complaint" | "unsorted";
  summary: string;
  senderName: string;
  createdAt: string;
  read: boolean;
};
export type Bell = { unread: number; items: BellItem[] };

export const BELL_LIMIT = 20;
export const markReadInputSchema = z.object({ id: z.uuid() }).strict();

/** Unread count and the latest 20, unread first. */
export async function bell(actor: InboxActor): Promise<Ok<{ bell: Bell }> | Err<"FORBIDDEN">> {
  if (!can(actor.role, "notifications.gm")) return { ok: false, code: "FORBIDDEN" };
  const db = getDb();
  const mine = eq(n.userId, actor.userId);
  const [[count], rows] = await Promise.all([
    db
      .select({ unread: sql<number>`count(*)::int` })
      .from(n)
      .where(and(mine, isNull(n.readAt))),
    db
      .select({
        id: n.id,
        enquiryId: n.enquiryId,
        kind: n.kind,
        readAt: n.readAt,
        createdAt: n.createdAt,
        extracted: e.extracted,
        senderName: e.senderName,
      })
      .from(n)
      .innerJoin(e, eq(e.id, n.enquiryId))
      .where(mine)
      .orderBy(sql`${n.readAt} IS NOT NULL`, desc(n.createdAt), desc(n.id))
      .limit(BELL_LIMIT),
  ]);
  return {
    ok: true,
    bell: {
      unread: Number(count?.unread ?? 0),
      items: rows.map((r) => {
        const s = (r.extracted as { summary?: unknown } | null)?.summary;
        return {
          id: r.id,
          enquiryId: r.enquiryId,
          kind: r.kind as BellItem["kind"],
          summary: typeof s === "string" && s ? s : "Staff review required",
          senderName: r.senderName,
          createdAt: r.createdAt.toISOString(),
          read: r.readAt !== null,
        };
      }),
    },
  };
}

export async function markRead(
  input: unknown,
  actor: InboxActor,
): Promise<Ok<{ changed: boolean }> | Err<"FORBIDDEN" | "INVALID_INPUT">> {
  if (!can(actor.role, "notifications.gm")) return { ok: false, code: "FORBIDDEN" };
  const parsed = markReadInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const rows = await getDb()
    .update(n)
    .set({ readAt: sql`clock_timestamp()` })
    .where(and(eq(n.id, parsed.data.id), eq(n.userId, actor.userId), isNull(n.readAt)))
    .returning({ id: n.id });
  return { ok: true, changed: rows.length > 0 };
}

export async function markAllRead(
  actor: InboxActor,
): Promise<Ok<{ count: number }> | Err<"FORBIDDEN">> {
  if (!can(actor.role, "notifications.gm")) return { ok: false, code: "FORBIDDEN" };
  const rows = await getDb()
    .update(n)
    .set({ readAt: sql`clock_timestamp()` })
    .where(and(eq(n.userId, actor.userId), isNull(n.readAt)))
    .returning({ id: n.id });
  return { ok: true, count: rows.length };
}
