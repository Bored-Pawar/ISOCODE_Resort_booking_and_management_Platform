/**
 * Client-safe inbox constants and display helpers: no imports, so client components can use
 * them without pulling auth or the database into the browser bundle. `rules.ts` re-exports all.
 */

export const LANES = [
  "mine",
  "room",
  "wedding",
  "offsite",
  "other",
  "complaints",
  "unsorted",
  "attention",
  "failed",
] as const;
export type Lane = (typeof LANES)[number];

export const LANE_LABELS: Record<Lane, string> = {
  mine: "Mine",
  room: "Rooms",
  wedding: "Weddings",
  offsite: "Offsites",
  other: "Other",
  complaints: "Complaints",
  unsorted: "Unsorted",
  attention: "Needs attention",
  failed: "Failed AI",
};

export const LANE_EMPTY: Record<Lane, string> = {
  mine: "Nothing assigned to you. Good.",
  room: "No room enquiries here.",
  wedding: "No wedding enquiries here.",
  offsite: "No offsite enquiries here.",
  other: "No other enquiries here.",
  complaints: "No complaints. Good.",
  unsorted: "Nothing unsorted. Good.",
  attention: "Nothing needs your attention.",
  failed: "No failed AI runs.",
};

export const STATUSES = ["new", "assigned", "replied", "closed"] as const;
export type InboxStatus = (typeof STATUSES)[number];
export const CHANNELS = ["web", "email", "whatsapp", "event_form"] as const;
export const CATEGORIES = ["room", "wedding", "offsite", "complaint", "other"] as const;

// ---- Attention requests (06 decision 2026-11-08, runbook 2.5) -----------------------------------

export const ATTENTION = "attention";
export const SEEN = "seen";
export const NOTE_MAX = 500;

/**
 * Event encoding, no schema change (`enquiry_events` has no note column):
 *  - request: action `rerouted`, from_value = the note, to_value = 'attention'
 *  - resolve: action `rerouted`, from_value = 'attention', to_value = 'seen: ' + reply note
 */
export type EventRow = {
  action: string;
  fromValue: string | null;
  toValue: string | null;
  at: string;
};
export const isAttentionRequest = (e: Pick<EventRow, "action" | "toValue">) =>
  e.action === "rerouted" && e.toValue === ATTENTION;
export const isAttentionResolve = (e: Pick<EventRow, "action" | "fromValue" | "toValue">) =>
  e.action === "rerouted" &&
  e.fromValue === ATTENTION &&
  e.toValue !== null &&
  (e.toValue === SEEN || e.toValue.startsWith(`${SEEN}: `));

// ---- Display helpers --------------------------------------------------------------------------

/** "2 h 14 m", "14 m", "3 d 2 h". Waiting stops at the first reply. */
export function formatWaiting(fromIso: string, toIso: string): string {
  const mins = Math.max(0, Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 60_000));
  if (mins < 60) return `${mins} m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ${mins % 60} m`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export const LOW_CONFIDENCE = 0.7;

export type Evidence = "ok" | "missing" | "unsupported" | "staff";
export const EVIDENCE_LABEL: Record<Evidence, string> = {
  ok: "From the message",
  unsupported: "Not in the message",
  missing: "Missing",
  staff: "Edited by staff",
};

// ---- Price warning (hard rule 3) ----------------------------------------------------------------

const RUPEE = /(?:₹|\b(?:rs\.?|inr)\s?)\s*(\d[\d,]*(?:\.\d+)?)/gi;
/** Rupee amounts in a text, normalised to plain digits ("₹12,400" -> "12400"). */
export function rupeeFigures(text: string): string[] {
  return [...text.matchAll(RUPEE)].map((m) => m[1].replace(/,/g, "").replace(/\.0+$/, ""));
}

/**
 * True when the edited body adds a rupee figure the server-written draft did not contain.
 * Staff may still save and send; the UI shows "Prices should come from the quote".
 */
export function addsNewPrice(original: string, edited: string): boolean {
  const known = new Set(rupeeFigures(original));
  return rupeeFigures(edited).some((n) => !known.has(n));
}
export const PRICE_WARNING = "Prices should come from the quote";
