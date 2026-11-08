/** "My bookings" display rules. Pure; types only from the booking module. */
import type { Booking } from "@/modules/booking";

export type StatusView = {
  label: string;
  tone: "success" | "warning" | "neutral" | "danger";
  /** Upcoming bookings first, then past stays, then holds that lapsed or were cancelled. */
  group: "upcoming" | "past" | "closed";
};

/**
 * What a guest sees for one booking. A HELD row whose hold has run out is shown as expired even
 * before the sweep marks it (the list never writes).
 */
export function statusView(
  b: Pick<Booking, "status" | "holdExpiresAt" | "checkOut">,
  now: number,
  today: string,
): StatusView {
  switch (b.status) {
    case "HELD":
      return b.holdExpiresAt && Date.parse(b.holdExpiresAt) > now
        ? { label: "Held, awaiting payment", tone: "warning", group: "upcoming" }
        : { label: "Hold expired", tone: "neutral", group: "closed" };
    case "CONFIRMED":
      return b.checkOut > today
        ? { label: "Confirmed", tone: "success", group: "upcoming" }
        : { label: "Past stay", tone: "neutral", group: "past" };
    case "EXPIRED":
      return { label: "Hold expired", tone: "neutral", group: "closed" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "danger", group: "closed" };
  }
}

/** Room names for a booking's lines, in line order: "Plantation Room, 2 x Estate Suite". */
export function roomsSummary(
  rooms: Pick<Booking["rooms"][number], "roomTypeId">[],
  names: Map<string, string>,
): string {
  const counts = new Map<string, number>();
  for (const r of rooms) {
    const name = names.get(r.roomTypeId) ?? "Room";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, n]) => (n > 1 ? `${n} x ${name}` : name)).join(", ");
}
