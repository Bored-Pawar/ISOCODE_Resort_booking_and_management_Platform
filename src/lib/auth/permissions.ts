/**
 * Staff capabilities (S2 admin runbook section 1). One table is the source of truth for every
 * server check (`requirePermission`), the staff navigation (`navFor`) and the enquiry inbox
 * filter (`enquiryVisibility`). Hiding a nav item is never the check: every page loader, server
 * action and route handler calls `requirePermission` itself.
 */
import { requireRole } from "./guards";
import type { Role, SessionUser } from "./types";

export type StaffRole = "reservations" | "sales" | "gm";

/** Capability -> roles that hold it. Guests hold none. */
export const PERMISSIONS = {
  /** A1 daily rates. */
  "rates.edit": ["reservations", "gm"],
  /** A2 website allotment. */
  "allotment.edit": ["reservations", "gm"],
  /** A3 online/offline by date (blackout_dates). */
  "availability.toggle": ["reservations", "gm"],
  /** A4 promo codes. */
  "promos.manage": ["reservations", "gm"],
  /** A5 bookings list and detail. */
  "bookings.view": ["reservations", "gm"],
  /** Room and other enquiry lanes. */
  "enquiries.room": ["reservations", "gm"],
  /** Wedding and offsite enquiries. */
  "enquiries.events": ["sales", "gm"],
  "enquiries.complaints": ["gm"],
  "enquiries.unsorted": ["gm"],
  /** Sales asks reservations and GM to look at an enquiry, with a note. */
  "attention.request": ["sales", "gm"],
  /** Mark an attention request seen, with a reply note. */
  "attention.resolve": ["reservations", "gm"],
  /** GM bell (complaint and unsorted alerts). */
  "notifications.gm": ["gm"],
} as const satisfies Record<string, readonly StaffRole[]>;

export type Capability = keyof typeof PERMISSIONS;
export const CAPABILITIES = Object.keys(PERMISSIONS) as Capability[];

/** Pure check. Unknown, guest or missing roles hold nothing. */
export function can(role: Role | null | undefined, cap: Capability): boolean {
  if (!role) return false;
  return (PERMISSIONS[cap] as readonly string[]).includes(role);
}

/** Roles holding a capability (for `requireRole` and for services that take an actor). */
export function rolesFor(cap: Capability): StaffRole[] {
  return [...PERMISSIONS[cap]];
}

/**
 * Call first in every staff page loader, server action and route handler. Throws `AccessError`
 * UNAUTHENTICATED without a session and FORBIDDEN when the role lacks the capability.
 */
export async function requirePermission(cap: Capability): Promise<SessionUser> {
  return requireRole(...rolesFor(cap));
}

export type NavIcon = "overview" | "bookings" | "rates" | "allotment" | "promos";
export type NavEntry = { href: string; label: string; icon: NavIcon };

/** Built admin screens and the capability each needs. Only real routes belong here. */
const NAV: { entry: NavEntry; anyOf: Capability[] }[] = [
  {
    entry: { href: "/admin/bookings", label: "Bookings", icon: "bookings" },
    anyOf: ["bookings.view"],
  },
  { entry: { href: "/admin/rates", label: "Rates", icon: "rates" }, anyOf: ["rates.edit"] },
  {
    entry: { href: "/admin/allotment", label: "Allotment", icon: "allotment" },
    anyOf: ["allotment.edit", "availability.toggle"],
  },
  { entry: { href: "/admin/promos", label: "Promos", icon: "promos" }, anyOf: ["promos.manage"] },
];

/** Staff navigation for a role: Overview for every staff role, then what the role may use. */
export function navFor(role: Role | null | undefined): NavEntry[] {
  if (role !== "reservations" && role !== "sales" && role !== "gm") return [];
  return [
    { href: "/admin", label: "Overview", icon: "overview" },
    ...NAV.filter((n) => n.anyOf.some((cap) => can(role, cap))).map((n) => n.entry),
  ];
}
