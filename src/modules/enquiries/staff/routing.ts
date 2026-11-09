/**
 * Q5 writes: extracted field edits and one-click re-route. Each runs in one transaction with the
 * enquiry row locked, rechecks the role against the locked row, and logs one `enquiry_events` row.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { enquiries as e, enquiryEvents, notifications, replyDrafts, users } from "@/db/schema";
import { getDb } from "@/lib/db";
import { isDateStr } from "@/lib/dates";
import type { Err, Ok } from "@/lib/result";
import type { StaffRole } from "@/lib/auth/permissions";
import { CATEGORIES, canWork, ownerRolesFor, type InboxActor } from "./rules";
import { visibilityOf, type Extracted } from "./detail";

const enquiryId = z.string().trim().min(1).max(40);
const date = z.string().refine(isDateStr, "Use a date");

export const fieldsInputSchema = z
  .object({
    enquiryId,
    dates: z
      .object({ from: date, to: date })
      .refine((d) => d.to > d.from, { message: "Check-out must be after check-in", path: ["to"] })
      .nullable(),
    guests: z
      .object({
        adults: z.number().int().min(1).max(40),
        children: z.number().int().min(0).max(40),
      })
      .nullable(),
    budgetInr: z.number().int().min(1).max(1_000_000_000).nullable(),
    room: z.string().trim().max(60).nullable(),
    language: z.string().trim().max(40).nullable(),
  })
  .strict();
export type FieldsInput = z.input<typeof fieldsInputSchema>;

export const rerouteInputSchema = z
  .object({ enquiryId, category: z.enum(CATEGORIES), ownerId: z.uuid() })
  .strict();
export type RerouteInput = z.input<typeof rerouteInputSchema>;

type Fail = Err<"INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "INVALID_OWNER">;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Saves edited fields into `extracted` (merged, never replaced) and logs `edited`. Returns whether
 * dates or guests changed, so the caller re-runs only the quote and draft step.
 */
export async function updateFields(
  input: unknown,
  actor: InboxActor,
): Promise<Ok<{ changed: string[]; requote: boolean }> | Fail> {
  const parsed = fieldsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const f = parsed.data;
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(e).where(eq(e.id, f.enquiryId)).for("update");
    if (!row) return { ok: false, code: "NOT_FOUND" } as const;
    if (!canWork(actor.role, visibilityOf(row))) return { ok: false, code: "FORBIDDEN" } as const;
    const x = (row.extracted ?? {}) as Extracted & Record<string, unknown>;
    const before = {
      dates: x.dates?.from && x.dates?.to ? { from: x.dates.from, to: x.dates.to } : null,
      guests:
        x.guests?.adults !== undefined
          ? { adults: x.guests.adults, children: x.guests.children ?? 0 }
          : null,
      budget: x.budget?.amountInr ?? null,
      room: x.room ?? null,
      language: x.language ?? null,
    };
    const after = {
      dates: f.dates,
      guests: f.guests,
      budget: f.budgetInr,
      room: f.room || null,
      language: f.language || null,
    };
    const changed = (Object.keys(after) as (keyof typeof after)[]).filter(
      (k) => !same(before[k], after[k]),
    );
    if (!changed.length) return { ok: true, changed: [], requote: false } as const;
    const next: Record<string, unknown> = {
      ...x,
      dates: f.dates ? { ...x.dates, from: f.dates.from, to: f.dates.to } : {},
      guests: f.guests
        ? {
            adults: f.guests.adults,
            children: f.guests.children,
            total: f.guests.adults + f.guests.children,
          }
        : {},
      budget: f.budgetInr !== null ? { ...x.budget, amountInr: f.budgetInr } : {},
      staffEdited: [...new Set([...(x.staffEdited ?? []), ...changed])],
    };
    if (after.room) next.room = after.room;
    else delete next.room;
    if (after.language) next.language = after.language;
    else delete next.language; // cleared: saved as cleared, like room (review minor 3)
    await tx.update(e).set({ extracted: next }).where(eq(e.id, row.id));
    await tx.insert(enquiryEvents).values({
      enquiryId: row.id,
      actor: actor.userId,
      action: "edited",
      fromValue: "fields",
      toValue: changed.join(","),
    });
    return {
      ok: true,
      changed,
      requote: changed.includes("dates") || changed.includes("guests"),
    } as const;
  });
}

/** Replaces the unsent, unapproved draft (or adds one) after a re-quote. Sent drafts never change. */
export async function replaceUnsentDraft(
  id: string,
  draft: {
    body: string;
    quote: unknown;
    provider: string;
    model: string | null;
    promptVersion: string;
  },
): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    await tx.select({ id: e.id }).from(e).where(eq(e.id, id)).for("update");
    const [current] = await tx
      .select()
      .from(replyDrafts)
      .where(eq(replyDrafts.enquiryId, id))
      .orderBy(sql`${replyDrafts.sentAt} DESC NULLS FIRST`)
      .limit(1);
    if (current && (current.sentAt || current.approvedBy)) return false;
    const values = {
      body: draft.body,
      quote: draft.quote as never,
      provider: draft.provider,
      model: draft.model,
      promptVersion: draft.promptVersion,
      edited: false,
    };
    if (current)
      await tx
        .update(replyDrafts)
        .set(values)
        .where(and(eq(replyDrafts.id, current.id), isNull(replyDrafts.sentAt)));
    else await tx.insert(replyDrafts).values({ enquiryId: id, ...values });
    return true;
  });
}

/**
 * One-click re-route: category and owner together, one `rerouted` event, lane becomes `sorted`.
 * The actor must be able to work the enquiry now; the new owner's role must be able to see the
 * new category (complaints stay with the GM). The item may leave the actor's own list.
 */
export async function reroute(
  input: unknown,
  actor: InboxActor,
): Promise<Ok<{ changed: boolean }> | Fail> {
  const parsed = rerouteInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const { enquiryId: id, category, ownerId } = parsed.data;
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(e).where(eq(e.id, id)).for("update");
    if (!row) return { ok: false, code: "NOT_FOUND" } as const;
    if (!canWork(actor.role, visibilityOf(row))) return { ok: false, code: "FORBIDDEN" } as const;
    const isComplaint = row.isComplaint || category === "complaint";
    const [owner] = await tx
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, ownerId));
    if (!owner || !ownerRolesFor(category, isComplaint).includes(owner.role as StaffRole))
      return { ok: false, code: "INVALID_OWNER" } as const;
    if (row.category === category && row.ownerId === ownerId && row.lane === "sorted")
      return { ok: true, changed: false } as const;
    await tx
      .update(e)
      .set({
        category,
        ownerId,
        lane: "sorted",
        isComplaint,
        status: row.status === "new" ? "assigned" : row.status,
      })
      .where(eq(e.id, id));
    const categoryChanged = row.category !== category || row.lane !== "sorted";
    await tx.insert(enquiryEvents).values({
      enquiryId: id,
      actor: actor.userId,
      action: "rerouted",
      fromValue: categoryChanged
        ? row.lane === "unsorted" || !row.category
          ? "unsorted"
          : row.category
        : `owner:${row.ownerId ?? "none"}`,
      toValue: categoryChanged ? category : `owner:${ownerId}`,
    });
    // A re-route can make something a complaint; it never removes a complaint's GM alert.
    if (isComplaint && !row.isComplaint) {
      const [gm] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "gm"))
        .orderBy(asc(users.createdAt), asc(users.id))
        .limit(1);
      if (gm)
        await tx.execute(sql`INSERT INTO notifications (user_id, enquiry_id, kind)
          SELECT ${gm.id}::uuid, ${id}, 'complaint'
          WHERE NOT EXISTS (SELECT 1 FROM ${notifications} WHERE user_id = ${gm.id}::uuid
            AND enquiry_id = ${id} AND kind = 'complaint')`);
    }
    return { ok: true, changed: true } as const;
  });
}
