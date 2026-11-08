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
import {
  CHANNELS,
  isAttentionRequest,
  isAttentionResolve,
  LANES,
  NOTE_MAX,
  STATUSES,
  type EventRow,
  type Lane,
} from "./display";

export * from "./display";

export type InboxActor = { userId: string; role: Role };

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

export const noteSchema = z.string().trim().min(1, "Add a short note.").max(NOTE_MAX);

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
