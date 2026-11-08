/** Re-drafting from the inbox (Q5 field edits, Q6 regenerate). Classification is never re-run. */
import { eq } from "drizzle-orm";
import { enquiries as e } from "@/db/schema";
import { getDb } from "@/lib/db";
import type { Extracted } from "./detail";
import { replaceUnsentDraft } from "./routing";

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

/**
 * Staff-confirmed facts override the message for fields staff edited. Once staff edited dates or
 * guests, the draft is grounded on these facts alone, so the other field is carried from the
 * stored extraction too, but only when the server already grounded it `ok` against the message
 * (an unsupported or missing value is never promoted to a fact). Without this, editing only the
 * guests left the dates unsupported and the rebuilt draft lost its quote (review MAJOR 1).
 */
export function staffFactsOf(row: Row) {
  const x = (row.extracted ?? {}) as Extracted;
  const edited = new Set(x.staffEdited ?? []);
  const anyEdited = edited.has("dates") || edited.has("guests");
  const carried = (field: "dates" | "guests") =>
    edited.has(field) || (anyEdited && x.grounding?.[field] === "ok");
  return {
    dates:
      carried("dates") && x.dates?.from && x.dates?.to
        ? { from: x.dates.from, to: x.dates.to }
        : null,
    guests:
      carried("guests") && x.guests?.adults !== undefined
        ? { adults: x.guests.adults, children: x.guests.children ?? 0 }
        : null,
    room: x.room ?? null,
  };
}

/**
 * Builds a new draft from the stored classification (and staff facts) and replaces the unsent one.
 * `callModel` asks the provider for new prose (Regenerate); prices still come only from the quote.
 */
export async function redraft(
  id: string,
  callModel: boolean,
): Promise<"ok" | "missing" | "locked"> {
  const [row] = await getDb().select().from(e).where(eq(e.id, id)).limit(1);
  if (!row) return "missing";
  const facts = staffFactsOf(row);
  const { draftForStaff } = await import("@/modules/ai-router");
  const draft = await draftForStaff({
    rawText: row.rawText,
    senderName: row.senderName,
    senderContact: row.senderContact,
    receivedAt: row.receivedAt,
    classification: storedClassification(row),
    staffFacts: facts.dates || facts.guests ? facts : null,
    callModel,
  });
  return (await replaceUnsentDraft(id, draft)) ? "ok" : "locked";
}
