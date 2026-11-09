/**
 * Re-drafting from the inbox (Q5 field edits, Q6 regenerate, quote Retry). Classification is
 * never re-run. Every rebuild runs under a generation recorded in `extracted.quoteBasis`
 * (see ./facts): approval is refused while it is in flight, after it fails, and for any draft that
 * was not built from the enquiry's current saved facts.
 */
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { enquiries as e, replyDrafts } from "@/db/schema";
import { getDb, type Tx } from "@/lib/db";
import { safeError } from "@/lib/log";
import type { Extracted } from "./detail";
import {
  basisOf,
  factsFingerprint,
  quoteFactsOf,
  quoteKey,
  roomTextOf,
  type QuoteBasis,
  type QuoteFacts,
} from "./facts";

type Row = typeof e.$inferSelect;

/** The stored classification, shaped for the router (same defaults as R2 `existing`). */
export function storedClassification(row: Row) {
  const x = (row.extracted ?? {}) as Extracted;
  return {
    category: (row.category ?? "other") as "room" | "wedding" | "offsite" | "complaint" | "other",
    confidence: row.confidence === null ? 0 : Number(row.confidence),
    dates: x.dates ?? {},
    guests: x.guests ?? {},
    budget: x.budget ?? {},
    language: x.language || "und",
    summary: x.summary || "Staff review required",
  };
}

export type RebuildOutcome = "ok" | "missing" | "locked" | "superseded" | "failed";

const stamp = () => new Date().toISOString();

/** `extracted` with the basis patched; everything else is kept. */
export function withBasis(extracted: unknown, patch: Partial<QuoteBasis>) {
  const x = (extracted ?? {}) as Record<string, unknown>;
  return { ...x, quoteBasis: { ...(basisOf(x) ?? {}), ...patch, at: stamp() } };
}

async function lockExtracted(tx: Tx, id: string) {
  const [row] = await tx
    .select({ extracted: e.extracted })
    .from(e)
    .where(eq(e.id, id))
    .for("update");
  return row;
}

/** Starts a rebuild: a new generation, state `rebuilding`, under the enquiry lock. */
export async function beginRebuild(id: string): Promise<string | null> {
  return getDb().transaction(async (tx) => {
    const row = await lockExtracted(tx, id);
    if (!row) return null;
    const gen = randomUUID();
    await tx
      .update(e)
      .set({ extracted: withBasis(row.extracted, { state: "rebuilding", gen }) })
      .where(eq(e.id, id));
    return gen;
  });
}

/** A failed rebuild leaves the old draft visible but never approvable until a rebuild lands. */
export async function failRebuild(id: string, gen: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const row = await lockExtracted(tx, id);
    if (!row || basisOf(row.extracted)?.gen !== gen) return;
    await tx
      .update(e)
      .set({ extracted: withBasis(row.extracted, { state: "failed" }) })
      .where(eq(e.id, id));
  });
}

/**
 * Writes a rebuilt draft and its basis together, only while this rebuild is still the latest and
 * the saved facts are still the ones it priced. Sent drafts never change.
 */
export async function commitDraft(
  id: string,
  gen: string,
  facts: QuoteFacts,
  draft: {
    body: string;
    quote: unknown;
    provider: string;
    model: string | null;
    promptVersion: string;
  },
): Promise<Exclude<RebuildOutcome, "failed">> {
  return getDb().transaction(async (tx) => {
    const row = await lockExtracted(tx, id);
    if (!row) return "missing";
    const fp = factsFingerprint(facts);
    if (basisOf(row.extracted)?.gen !== gen || factsFingerprint(quoteFactsOf(row.extracted)) !== fp)
      return "superseded";
    const [current] = await tx
      .select()
      .from(replyDrafts)
      .where(eq(replyDrafts.enquiryId, id))
      .orderBy(sql`${replyDrafts.sentAt} DESC NULLS FIRST`)
      .limit(1)
      .for("update");
    if (current && (current.sentAt || current.approvedBy)) {
      await tx
        .update(e)
        .set({ extracted: withBasis(row.extracted, { state: "locked" }) })
        .where(eq(e.id, id));
      return "locked";
    }
    const values = {
      body: draft.body,
      quote: draft.quote as never,
      provider: draft.provider,
      model: draft.model,
      promptVersion: draft.promptVersion,
      edited: false,
    };
    let draftId: string;
    if (current) {
      await tx
        .update(replyDrafts)
        .set(values)
        .where(and(eq(replyDrafts.id, current.id), isNull(replyDrafts.sentAt)));
      draftId = current.id;
    } else {
      const [inserted] = await tx
        .insert(replyDrafts)
        .values({ enquiryId: id, ...values })
        .returning({ id: replyDrafts.id });
      draftId = inserted.id;
    }
    await tx
      .update(e)
      .set({
        extracted: withBasis(row.extracted, {
          state: "ready",
          gen,
          fp,
          facts,
          draftId,
          quoteKey: quoteKey(draft.quote),
        }),
      })
      .where(eq(e.id, id));
    return "ok";
  });
}

/**
 * Builds a new draft from the stored classification and the saved quote facts, then commits it.
 * `callModel` asks the provider for new prose (Regenerate); prices still come only from the quote.
 */
export async function redraft(
  id: string,
  callModel: boolean,
  gen: string,
): Promise<Exclude<RebuildOutcome, "failed">> {
  const [row] = await getDb().select().from(e).where(eq(e.id, id)).limit(1);
  if (!row) return "missing";
  if (basisOf(row.extracted)?.gen !== gen) return "superseded";
  const facts = quoteFactsOf(row.extracted);
  const { draftForStaff, messageRoomLabel } = await import("@/modules/ai-router");
  const draft = await draftForStaff({
    rawText: row.rawText,
    senderName: row.senderName,
    senderContact: row.senderContact,
    receivedAt: row.receivedAt,
    classification: storedClassification(row),
    staffFacts: facts.staff
      ? {
          dates: facts.dates,
          guests: facts.guests,
          room: roomTextOf(facts.room, messageRoomLabel(row.rawText)),
          roomSource: facts.room.source,
        }
      : null,
    callModel,
  });
  return commitDraft(id, gen, facts, draft);
}

/** One rebuild to completion. Any error marks it failed; the old draft is never left sendable. */
export async function rebuild(
  id: string,
  gen: string,
  callModel: boolean,
): Promise<RebuildOutcome> {
  try {
    return await redraft(id, callModel, gen);
  } catch (error) {
    console.error("inbox re-quote failed", safeError(error));
    // If even this write fails, the basis stays `rebuilding`, which approval also refuses.
    await failRebuild(id, gen).catch(() => {});
    return "failed";
  }
}
