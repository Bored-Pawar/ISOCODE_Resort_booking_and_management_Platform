/** Approved R2 transaction bridge. Only ai-router may consume this internal entry point. */
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { enquiries, users } from "@/db/schema";
import { getDb, type Db, type Tx } from "@/lib/db";
import type { EnquiryCategory } from "./types";

export const STALE_MS = 120_000;
export const SWEEP_LIMIT = 5;
export const MAX_PROCESSING_ATTEMPTS = 3;
type Row = typeof enquiries.$inferSelect;
export async function ownerRoleFor(row: Row) {
  if (!row.ownerId) return null;
  const [owner] = await getDb()
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, row.ownerId));
  return owner && ["gm", "sales", "reservations"].includes(owner.role)
    ? (owner.role as "gm" | "sales" | "reservations")
    : null;
}
export type Claim = { row: Row; attempt: number; updatedAt: Date };
export type ClaimResult =
  | { kind: "claimed"; claim: Claim }
  | { kind: "existing"; row: Row }
  | { kind: "missing" }
  | { kind: "busy" };
export type Settlement = {
  status: "ok" | "fallback";
  category: EnquiryCategory;
  confidence: number;
  extracted: Record<string, unknown>;
  ownerRole: "reservations" | "sales" | "gm" | null;
  notifyGm: boolean;
  lastError: string | null;
  draft: {
    body: string;
    quote: unknown;
    provider: string;
    model: string | null;
    promptVersion: string;
  };
};

const untouched = sql`NOT EXISTS (SELECT 1 FROM enquiry_events ev WHERE ev.enquiry_id = ${enquiries.id} AND ev.action <> 'classified'
    AND NOT COALESCE((ev.action = 'edited' AND ev.from_value = 'ai:failed' AND ev.to_value = 'ai:pending:retry'), false))
  AND NOT EXISTS (SELECT 1 FROM reply_drafts d WHERE d.enquiry_id = ${enquiries.id}
    AND (d.edited OR d.approved_by IS NOT NULL OR d.sent_at IS NOT NULL))`;

export function queueStateEligibility(now: SQL = sql`clock_timestamp()`) {
  return sql`(${enquiries.aiStatus} = 'pending' OR (${enquiries.aiStatus} = 'processing'
    AND ${enquiries.aiUpdatedAt} <= ${now} - interval '2 minutes'))`;
}
export function queueEligibility(now: SQL = sql`clock_timestamp()`) {
  return and(
    queueStateEligibility(now),
    sql`${enquiries.aiAttempts} < ${MAX_PROCESSING_ATTEMPTS}`,
  )!;
}

const staffSafe = and(
  eq(enquiries.status, "new"),
  sql`${enquiries.ownerId} IS NULL`,
  sql`${enquiries.firstReplyAt} IS NULL`,
  untouched,
)!;
async function exhaust(tx: Tx, id: string) {
  await tx
    .update(enquiries)
    .set({
      aiStatus: "failed",
      aiLastError: "ATTEMPTS_EXHAUSTED",
      lane: "unsorted",
      aiUpdatedAt: sql`date_trunc('milliseconds', clock_timestamp())`,
    })
    .where(
      and(
        eq(enquiries.id, id),
        queueStateEligibility(),
        sql`${enquiries.aiAttempts} >= ${MAX_PROCESSING_ATTEMPTS}`,
        staffSafe,
      ),
    );
}

export async function claimEnquiry(id: string, db: Db = getDb()): Promise<ClaimResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(enquiries).where(eq(enquiries.id, id)).for("update");
    if (!row) return { kind: "missing" };
    if (row.aiStatus === "ok" || row.aiStatus === "fallback") return { kind: "existing", row };
    if (row.aiAttempts >= MAX_PROCESSING_ATTEMPTS) {
      await exhaust(tx, id);
      return { kind: "busy" };
    }
    const [claimed] = await tx
      .update(enquiries)
      .set({
        aiStatus: "processing",
        aiAttempts: sql`${enquiries.aiAttempts} + 1`,
        aiUpdatedAt: sql`date_trunc('milliseconds', clock_timestamp())`,
        aiLastError: null,
      })
      .where(
        and(
          eq(enquiries.id, id),
          queueEligibility(),
          eq(enquiries.status, "new"),
          sql`${enquiries.ownerId} IS NULL`,
          sql`${enquiries.firstReplyAt} IS NULL`,
          untouched,
        ),
      )
      .returning();
    return claimed
      ? {
          kind: "claimed",
          claim: { row: claimed, attempt: claimed.aiAttempts, updatedAt: claimed.aiUpdatedAt },
        }
      : { kind: "busy" };
  });
}

/** Uses the indexed queue state; seeded terminal/failed rows are never requeued. */
export async function sweepCandidates(db: Db = getDb()): Promise<string[]> {
  await db.transaction(async (tx) => {
    const exhausted = await tx
      .select({ id: enquiries.id })
      .from(enquiries)
      .where(
        and(
          queueStateEligibility(),
          sql`${enquiries.aiAttempts} >= ${MAX_PROCESSING_ATTEMPTS}`,
          staffSafe,
        ),
      )
      .orderBy(asc(enquiries.aiUpdatedAt), asc(enquiries.id))
      .limit(SWEEP_LIMIT)
      .for("update", { skipLocked: true });
    for (const row of exhausted) await exhaust(tx, row.id);
  });
  const rows = await db
    .select({ id: enquiries.id })
    .from(enquiries)
    .where(
      and(
        queueEligibility(),
        eq(enquiries.status, "new"),
        sql`${enquiries.ownerId} IS NULL`,
        untouched,
      ),
    )
    .orderBy(asc(enquiries.aiUpdatedAt), asc(enquiries.id))
    .limit(SWEEP_LIMIT);
  return rows.map((r) => r.id);
}

/** A thrown processing attempt consumes its claim; only the third failure becomes terminal. */
export async function failClaim(claim: Claim, db: Db = getDb()) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(enquiries)
      .where(eq(enquiries.id, claim.row.id))
      .for("update");
    if (
      !row ||
      row.aiStatus !== "processing" ||
      row.aiAttempts !== claim.attempt ||
      row.aiUpdatedAt.getTime() !== claim.updatedAt.getTime()
    )
      return;
    await tx
      .update(enquiries)
      .set({
        aiLastError:
          claim.attempt >= MAX_PROCESSING_ATTEMPTS ? "ATTEMPTS_EXHAUSTED" : "PROCESSING_FAILED",
        ...(claim.attempt >= MAX_PROCESSING_ATTEMPTS
          ? { aiStatus: "failed", lane: "unsorted" }
          : {}),
      })
      .where(and(eq(enquiries.id, row.id), staffSafe));
  });
}

/** Called only after staff authorization. Expected generation prevents stale browser Retry requests. */
export async function resetFailedEnquiry(
  input: { enquiryId: string; expectedUpdatedAt: string; expectedAttempts: number },
  actorId: string,
  db: Db = getDb(),
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(enquiries)
      .where(eq(enquiries.id, input.enquiryId))
      .for("update");
    if (
      !row ||
      row.aiStatus !== "failed" ||
      row.aiLastError !== "ATTEMPTS_EXHAUSTED" ||
      row.aiAttempts !== input.expectedAttempts ||
      row.aiUpdatedAt.toISOString() !== input.expectedUpdatedAt
    )
      return false;
    const [reset] = await tx
      .update(enquiries)
      .set({
        aiStatus: "pending",
        aiAttempts: 0,
        aiLastError: null,
        aiUpdatedAt: sql`date_trunc('milliseconds', clock_timestamp())`,
        lane: "unsorted",
      })
      .where(and(eq(enquiries.id, row.id), staffSafe))
      .returning({ id: enquiries.id });
    if (!reset) return false;
    await tx.execute(sql`INSERT INTO enquiry_events (enquiry_id, actor, action, from_value, to_value)
      VALUES (${row.id}, ${actorId}, 'edited', 'ai:failed', 'ai:pending:retry')`);
    return true;
  });
}

async function firstStaff(tx: Tx, role: string) {
  // There is no active/disabled column. Every existing staff-role account is eligible.
  const [user] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, role))
    .orderBy(asc(users.createdAt), asc(users.id))
    .limit(1);
  return user?.id ?? null;
}

export async function settleEnquiry(
  claim: Claim,
  result: Settlement,
  db: Db = getDb(),
): Promise<Row | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(enquiries)
      .where(eq(enquiries.id, claim.row.id))
      .for("update");
    if (
      !row ||
      row.aiStatus !== "processing" ||
      row.aiAttempts !== claim.attempt ||
      row.aiUpdatedAt.getTime() !== claim.updatedAt.getTime()
    )
      return null;
    const [safe] = await tx
      .select({ id: enquiries.id })
      .from(enquiries)
      .where(and(eq(enquiries.id, row.id), untouched));
    if (
      !safe ||
      row.status !== claim.row.status ||
      row.ownerId !== claim.row.ownerId ||
      row.lane !== claim.row.lane ||
      row.firstReplyAt !== null ||
      row.rawText !== claim.row.rawText ||
      JSON.stringify(row.extracted) !== JSON.stringify(claim.row.extracted) ||
      row.category !== claim.row.category ||
      row.confidence !== claim.row.confidence ||
      row.isComplaint !== claim.row.isComplaint
    ) {
      await tx
        .update(enquiries)
        .set({
          aiStatus: "failed",
          aiLastError: "STAFF_CHANGED",
          aiUpdatedAt: sql`clock_timestamp()`,
        })
        .where(eq(enquiries.id, row.id));
      return null;
    }
    const ownerId = result.ownerRole ? await firstStaff(tx, result.ownerRole) : null;
    const lane = ownerId ? "sorted" : "unsorted";
    const [saved] = await tx
      .update(enquiries)
      .set({
        category: result.category,
        confidence: String(result.confidence),
        extracted: { ...((row.extracted as Record<string, unknown>) ?? {}), ...result.extracted },
        aiStatus: result.status,
        aiLastError: result.lastError,
        aiUpdatedAt: sql`clock_timestamp()`,
        lane,
        ownerId,
        status: ownerId ? "assigned" : "new",
        isComplaint: result.notifyGm,
      })
      .where(eq(enquiries.id, row.id))
      .returning();
    await tx.execute(sql`INSERT INTO reply_drafts (enquiry_id, body, quote, provider, model, prompt_version, edited)
      SELECT ${row.id}, ${result.draft.body}, ${JSON.stringify(result.draft.quote)}::jsonb,
        ${result.draft.provider}, ${result.draft.model}, ${result.draft.promptVersion}, false
      WHERE NOT EXISTS (SELECT 1 FROM reply_drafts WHERE enquiry_id = ${row.id})`);
    if (result.notifyGm || lane === "unsorted") {
      const gm = await firstStaff(tx, "gm");
      const kind = result.notifyGm ? "complaint" : "unsorted";
      if (gm)
        await tx.execute(sql`INSERT INTO notifications (user_id, enquiry_id, kind)
        SELECT ${gm}::uuid, ${row.id}, ${kind}
        WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = ${gm}::uuid AND enquiry_id = ${row.id} AND kind = ${kind})`);
    }
    await tx.execute(sql`INSERT INTO enquiry_events (enquiry_id, actor, action, from_value, to_value)
      SELECT ${row.id}, 'ai-router', 'classified', NULL, ${result.category}
      WHERE NOT EXISTS (SELECT 1 FROM enquiry_events WHERE enquiry_id = ${row.id} AND actor = 'ai-router' AND action = 'classified')`);
    return saved;
  });
}
