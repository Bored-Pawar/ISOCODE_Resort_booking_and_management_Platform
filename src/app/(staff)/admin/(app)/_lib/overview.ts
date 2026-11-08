/**
 * What `/admin` shows each staff role (runbook 2.2). Built from the capability table, so a role
 * only sees what it can use. Enquiry counts come from `inbox.counts` (open rows, per lane) and link
 * to that inbox lane.
 */
import { can, type Capability } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth";
import type { Lane } from "@/modules/enquiries";

export type OverviewItem =
  | { kind: "arrivals"; label: string; href: string }
  | { kind: "enquiries"; label: string; cap: Capability; lanes: Lane[]; href: string }
  | { kind: "link"; label: string; help: string; href: string };

const enquiries = (label: string, cap: Capability, lanes: Lane[]): OverviewItem => ({
  kind: "enquiries",
  label,
  cap,
  lanes,
  href: `/admin/inbox?lane=${lanes[0]}`,
});

/** Every lane the overview counts, for one `inbox.counts` call. */
export function overviewLanes(items: OverviewItem[]): Lane[] {
  return [...new Set(items.flatMap((i) => (i.kind === "enquiries" ? i.lanes : [])))];
}

export function overviewFor(role: Role, today: string): { intro: string; items: OverviewItem[] } {
  const items: OverviewItem[] = [];
  if (can(role, "bookings.view"))
    items.push({
      kind: "arrivals",
      label: "Arrivals today",
      href: `/admin/bookings?status=CONFIRMED&from=${today}&to=${today}`,
    });
  if (can(role, "enquiries.complaints"))
    items.push(enquiries("Open complaints", "enquiries.complaints", ["complaints"]));
  if (can(role, "enquiries.unsorted"))
    items.push(enquiries("Unsorted enquiries", "enquiries.unsorted", ["unsorted"]));
  if (can(role, "enquiries.room"))
    items.push(enquiries("Open room enquiries", "enquiries.room", ["room"]));
  if (can(role, "enquiries.events"))
    items.push(
      enquiries("Open wedding and offsite enquiries", "enquiries.events", ["wedding", "offsite"]),
    );
  if (can(role, "attention.resolve"))
    items.push(enquiries("Needs attention from sales", "attention.resolve", ["attention"]));
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
