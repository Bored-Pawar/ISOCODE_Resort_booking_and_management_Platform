/**
 * Pure inbox rules (S2 inbox runbook 2.1 to 2.5). No database here: the SQL in `queries.ts` mirrors
 * these and the unit tests hold both to `canSeeEnquiry` from `permissions.ts`.
 */
import { z } from "zod";
import {
  can,
  canSeeEnquiry,
  enquiryVisibility,
  type EnquiryCategory,
  type StaffRole,
} from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/types";

export type InboxActor = { userId: string; role: Role };

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

/** Lanes a role may open, in display order. Guests get none. */
export function lanesFor(role: Role | null | undefined): Lane[] {
  const v = enquiryVisibility(role);
  if (!v.categories.length && !v.lanes.length) return [];
  const lanes: Lane[] = ["mine"];
  for (const c of ["room", "wedding", "offsite", "other"] as const)
    if (v.categories.includes(c)) lanes.push(c);
  if (v.complaints) lanes.push("complaints");
  if (v.lanes.includes("unsorted")) lanes.push("unsorted");
  if (can(role, "attention.resolve")) lanes.push("attention");
  if (can(role, "enquiries.unsorted")) lanes.push("failed");
  return lanes;
}

/** Lanes that carry a count badge (runbook 2.1), filtered to the role. */
export function badgeLanesFor(role: Role | null | undefined): Lane[] {
  return lanesFor(role).filter((l) => l === "unsorted" || l === "complaints" || l === "attention");
}

export const STATUSES = ["new", "assigned", "replied", "closed"] as const;
export type InboxStatus = (typeof STATUSES)[number];
export const CHANNELS = ["web", "email", "whatsapp", "event_form"] as const;
export const CATEGORIES = ["room", "wedding", "offsite", "complaint", "other"] as const;

export const PAGE_SIZE = 25;

export const listInputSchema = z.object({
  lane: z.enum(LANES).default("mine"),
  status: z.enum(STATUSES).optional(),
  channel: z.enum(CHANNELS).optional(),
  q: z.string().trim().max(100).optional(),
  /** Keyset cursor: `${receivedAtIso}|${id}` of the last row of the previous page. */
  cursor: z
    .string()
    .max(140)
    .regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\|ENQ-[\w-]{1,40}$/)
    .optional(),
});
export type ListInput = z.input<typeof listInputSchema>;

/** The fields every visibility decision needs. */
export type VisibilityRow = {
  category: EnquiryCategory | null;
  lane: "sorted" | "unsorted";
  isComplaint: boolean;
};

/**
 * May this role work the enquiry (edit fields, re-route, drafts, close)? Exactly `canSeeEnquiry`:
 * own lanes only, complaints GM only.
 */
export function canWork(role: Role | null | undefined, e: VisibilityRow): boolean {
  return canSeeEnquiry(role, e);
}

/**
 * May this role open the enquiry? Its own lanes, plus (for `attention.resolve` holders) a
 * non-complaint enquiry sales asked them to look at. Reading only; working stays `canWork`.
 */
export function canView(
  role: Role | null | undefined,
  e: VisibilityRow & { attentionRequested: boolean },
): boolean {
  if (canWork(role, e)) return true;
  const complaint = e.isComplaint || e.category === "complaint";
  return !complaint && e.attentionRequested && can(role, "attention.resolve");
}

/** Roles whose users may own a sorted enquiry of this category (re-route owner select). */
export function ownerRolesFor(category: EnquiryCategory, isComplaint: boolean): StaffRole[] {
  const roles: StaffRole[] = ["reservations", "sales", "gm"];
  return roles.filter((r) => canWork(r, { category, lane: "sorted", isComplaint }));
}

/** Default owner role for a category: the department, else the GM. */
export function defaultOwnerRole(category: EnquiryCategory, isComplaint: boolean): StaffRole {
  if (isComplaint || category === "complaint") return "gm";
  if (category === "room" || category === "other") return "reservations";
  return "sales";
}

// ---- Attention requests (06 decision 2026-11-08, runbook 2.5) -----------------------------------

export const ATTENTION = "attention";
export const SEEN = "seen";
export const NOTE_MAX = 500;
export const noteSchema = z.string().trim().min(1, "Add a short note.").max(NOTE_MAX);

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

/** Open when the latest request has no later resolve. A request after a resolve reopens it. */
export function attentionOpen(events: EventRow[]): boolean {
  let lastRequest = -Infinity;
  let lastResolve = -Infinity;
  for (const e of events) {
    const t = Date.parse(e.at);
    if (isAttentionRequest(e)) lastRequest = Math.max(lastRequest, t);
    else if (isAttentionResolve(e)) lastResolve = Math.max(lastResolve, t);
  }
  return lastRequest > -Infinity && lastRequest > lastResolve;
}

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
