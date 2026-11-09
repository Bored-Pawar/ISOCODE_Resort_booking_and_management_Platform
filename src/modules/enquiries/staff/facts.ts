/**
 * Quote facts and the facts basis of the unsent draft (production QA-01, QA-02).
 *
 * The facts a quote is priced from are derived only from what is saved on the enquiry. Room has
 * three states: `message` (staff never touched it: the guest's own words decide), `staff` (staff
 * replaced it) and `cleared` (staff removed it: the draft asks instead of guessing).
 *
 * The basis lives in `enquiries.extracted.quoteBasis` (JSONB, no schema change), on the row every
 * writer already locks. A quote-affecting edit marks it `rebuilding` in the same transaction; a
 * rebuild commits only while its generation is still current; a failure marks it `failed`.
 * Approval recomputes the fingerprint from the saved facts inside the enquiry lock and refuses
 * anything that is not `ready` for exactly this draft and these facts.
 */
import { createHash } from "node:crypto";

/** Fields whose change re-prices the draft. The rate plan is not editable in the inbox (EP). */
export const QUOTE_FIELDS = ["dates", "guests", "room"] as const;
export type QuoteField = (typeof QUOTE_FIELDS)[number];

export type RoomFact =
  { source: "message" } | { source: "staff"; name: string } | { source: "cleared" };

export type QuoteFacts = {
  /** True once staff changed a quote-affecting field: these facts, not the message, are evidence. */
  staff: boolean;
  dates: { from: string; to: string } | null;
  guests: { adults: number; children: number } | null;
  room: RoomFact;
};

export type QuoteBasis = {
  state: "ready" | "rebuilding" | "failed" | "locked";
  /** Generation of the latest rebuild; a rebuild that is no longer the latest cannot commit. */
  gen: string;
  /** `factsFingerprint` of the facts the draft below was built from (state `ready`). */
  fp?: string;
  facts?: QuoteFacts;
  draftId?: string;
  /** `quoteKey(draft.quote)` of that draft, so a draft whose quote changed is not covered. */
  quoteKey?: string;
  at: string;
};

/** The subset of `extracted` these rules read. */
type Saved = {
  dates?: { from?: string; to?: string };
  guests?: { adults?: number; children?: number };
  room?: string;
  grounding?: { dates?: string; guests?: string; room?: string };
  staffEdited?: string[];
  quoteBasis?: QuoteBasis;
};

/**
 * Staff-confirmed facts override the message for fields staff edited. Once staff edited any
 * quote-affecting field, the draft is grounded on these facts alone, so dates and guests are
 * carried from the stored extraction too, but only when the server grounded them `ok` against the
 * message (an unsupported or missing value is never promoted to a fact). The room is never
 * dropped: if staff did not touch it, the guest's own preference still applies.
 */
export function quoteFactsOf(extracted: unknown): QuoteFacts {
  const x = (extracted ?? {}) as Saved;
  const edited = new Set(x.staffEdited ?? []);
  const staff = QUOTE_FIELDS.some((f) => edited.has(f));
  const carried = (field: "dates" | "guests") =>
    edited.has(field) || (staff && x.grounding?.[field] === "ok");
  return {
    staff,
    dates:
      carried("dates") && x.dates?.from && x.dates?.to
        ? { from: x.dates.from, to: x.dates.to }
        : null,
    guests:
      carried("guests") && x.guests?.adults !== undefined
        ? { adults: x.guests.adults, children: x.guests.children ?? 0 }
        : null,
    room: edited.has("room")
      ? x.room
        ? { source: "staff", name: x.room }
        : { source: "cleared" }
      : { source: "message" },
  };
}

/** Key-sorted JSON: JSONB reorders object keys, so a hash must not depend on key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}

const hash = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex").slice(0, 16);

export function factsFingerprint(f: QuoteFacts): string {
  return hash({ s: f.staff, d: f.dates, g: f.guests, r: f.room });
}

export function quoteKey(quote: unknown): string {
  return hash(quote);
}

export function basisOf(extracted: unknown): QuoteBasis | null {
  const b = (extracted as Saved | null)?.quoteBasis;
  return b && typeof b === "object" && typeof b.state === "string" ? b : null;
}

/** `current`: approvable. Anything else needs a rebuild (or its completion) first. */
export type QuoteState = "current" | "rebuilding" | "failed" | "stale";

/**
 * Whether the unsent `draft` was priced from the enquiry's current saved facts. A draft without a
 * recorded basis is the intake draft built from the message itself, which is current only while
 * staff have not changed a quote-affecting field (older rebuilds recorded no basis: refuse them).
 */
export function quoteStateOf(
  extracted: unknown,
  draft: { id: string; quote: unknown },
): QuoteState {
  const facts = quoteFactsOf(extracted);
  const basis = basisOf(extracted);
  if (!basis) return facts.staff ? "stale" : "current";
  if (basis.state === "rebuilding") return "rebuilding";
  if (basis.state === "failed") return "failed";
  if (
    basis.state !== "ready" ||
    basis.fp !== factsFingerprint(facts) ||
    basis.draftId !== draft.id ||
    basis.quoteKey !== quoteKey(draft.quote)
  )
    return "stale";
  return "current";
}

/** The facts a draft was built on, for display: the recorded basis, or the message's facts. */
export function builtOnFacts(extracted: unknown, state: QuoteState): QuoteFacts | null {
  const basis = basisOf(extracted);
  if (basis?.facts) return basis.facts;
  if (basis || state !== "current") return null;
  // Intake draft: grounded message facts.
  const x = (extracted ?? {}) as Saved;
  return {
    staff: false,
    dates:
      x.grounding?.dates === "ok" && x.dates?.from && x.dates?.to
        ? { from: x.dates.from, to: x.dates.to }
        : null,
    guests:
      x.grounding?.guests === "ok" && x.guests?.adults !== undefined
        ? { adults: x.guests.adults, children: x.guests.children ?? 0 }
        : null,
    room: { source: "message" },
  };
}

/** The room text the facts quote: staff's, the message's own label, or none when cleared. */
export function roomTextOf(room: RoomFact, messageLabel: string | null): string | null {
  return room.source === "staff" ? room.name : room.source === "message" ? messageLabel : null;
}
