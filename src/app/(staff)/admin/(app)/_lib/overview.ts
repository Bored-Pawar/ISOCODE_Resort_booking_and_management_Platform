/**
 * What `/admin` shows each staff role (runbook 2.2). Built from the capability table, so a role
 * only sees what it can use. Counts that need the enquiry inbox (Codex Q4) are `pending` and say
 * "Coming with the inbox"; only built screens are linked.
 */
import { can, type Capability } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth";

export type OverviewItem =
  | { kind: "arrivals"; label: string; href: string }
  | { kind: "pending"; label: string; cap: Capability }
  | { kind: "link"; label: string; help: string; href: string };

export const INBOX_PENDING = "Coming with the inbox";

export function overviewFor(role: Role, today: string): { intro: string; items: OverviewItem[] } {
  const items: OverviewItem[] = [];
  if (can(role, "bookings.view"))
    items.push({
      kind: "arrivals",
      label: "Arrivals today",
      href: `/admin/bookings?status=CONFIRMED&from=${today}&to=${today}`,
    });
  if (can(role, "enquiries.complaints"))
    items.push({ kind: "pending", label: "Open complaints", cap: "enquiries.complaints" });
  if (can(role, "enquiries.unsorted"))
    items.push({ kind: "pending", label: "Unsorted enquiries", cap: "enquiries.unsorted" });
  if (can(role, "enquiries.room"))
    items.push({ kind: "pending", label: "Open room enquiries", cap: "enquiries.room" });
  if (can(role, "enquiries.events"))
    items.push({
      kind: "pending",
      label: "Open wedding and offsite enquiries",
      cap: "enquiries.events",
    });
  if (can(role, "attention.resolve"))
    items.push({ kind: "pending", label: "Needs attention from sales", cap: "attention.resolve" });
  if (can(role, "rates.edit"))
    items.push({
      kind: "link",
      label: "Rates",
      help: "Nightly prices per room and plan",
      href: "/admin/rates",
    });
  if (can(role, "allotment.edit"))
    items.push({
      kind: "link",
      label: "Allotment",
      help: "Rooms the website may sell, and offline dates",
      href: "/admin/allotment",
    });
  if (can(role, "promos.manage"))
    items.push({
      kind: "link",
      label: "Promo codes",
      help: "Create and switch off discount codes",
      href: "/admin/promos",
    });

  const intro =
    role === "gm"
      ? "Everything across the estate: complaints, unsorted enquiries and both departments."
      : role === "sales"
        ? "Wedding and offsite enquiries. You can ask reservations and the GM to look at one from the inbox."
        : "Today's arrivals, room enquiries, and the rates and stock the website sells.";
  return { intro, items };
}
