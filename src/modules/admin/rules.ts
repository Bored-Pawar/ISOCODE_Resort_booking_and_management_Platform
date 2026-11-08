/**
 * Pure admin rules shared by the services (`pricing/admin.ts`, `inventory/admin.ts`), the server
 * actions and the staff screens. No database access, safe to import from client components.
 */
import { addDays, eachNight, todayIST, type DateStr } from "@/lib/dates";

/** The seed writes 180 days of rates and inventory from the day it runs (`db/seed/index.ts`). */
export const ADMIN_HORIZON_DAYS = 180;
/** Days shown per grid page. */
export const GRID_DAYS = 30;

/** Editable window: today IST to the last day of the seeded horizon, both inclusive. */
export function adminWindow(now: Date = new Date()): { first: DateStr; last: DateStr } {
  const first = todayIST(now);
  return { first, last: addDays(first, ADMIN_HORIZON_DAYS - 1) };
}

/** Day of week of a night, 0 = Sunday (same as JavaScript and Postgres `extract(dow)`). */
export function dayOfWeek(date: DateStr): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Weekend nights cost more in the seed: Friday and Saturday (`db/seed/pricing.ts`). */
export const WEEKEND_DAYS = [5, 6] as const;
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export const WEEKDAYS = [0, 1, 2, 3, 4] as const;
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function isWeekend(date: DateStr): boolean {
  return (WEEKEND_DAYS as readonly number[]).includes(dayOfWeek(date));
}

/** Every date from `from` to `to` (inclusive) whose day of week is in `days`. */
export function datesMatching(from: DateStr, to: DateStr, days: readonly number[]): DateStr[] {
  if (to < from) return [];
  return eachNight(from, addDays(to, 1)).filter((d) => days.includes(dayOfWeek(d)));
}

/** First grid date for a requested start: inside the window, so 30 days never pass its end. */
export function clampGridStart(requested: string | undefined, now: Date = new Date()): DateStr {
  const { first, last } = adminWindow(now);
  const latest = addDays(last, -(GRID_DAYS - 1));
  if (!requested || !/^\d{4}-\d{2}-\d{2}$/.test(requested)) return first;
  if (requested < first) return first;
  if (requested > latest) return latest;
  return requested;
}

/** "Updates 48 prices across 2 rooms" (the bulk preview line). */
export function previewLine(cells: number, rooms: number, noun: [string, string]): string {
  const [one, many] = noun;
  return `Updates ${cells} ${cells === 1 ? one : many} across ${rooms} ${rooms === 1 ? "room" : "rooms"}`;
}

/** Why a date span cannot be edited, or null when it sits inside the editable window. */
export function windowError(from: DateStr, to: DateStr, now: Date = new Date()): string | null {
  const { first, last } = adminWindow(now);
  if (from < first) return "Dates in the past cannot be changed.";
  if (to > last) return `Dates after ${last} are outside the ${ADMIN_HORIZON_DAYS} day horizon.`;
  return null;
}

/** Who is making an admin change. `userId` comes from the server session only. */
export type AdminActor = { userId: string; role: "guest" | "reservations" | "sales" | "gm" };

/**
 * Cells a bulk edit will touch, for the preview line: per selected room, its plans with a
 * selected code, times the matching dates. Matches what the service writes (active plans only).
 */
export function bulkPreview(input: {
  rooms: { id: string; plans: string[] }[];
  roomTypeIds: string[];
  planCodes?: string[];
  from: DateStr;
  to: DateStr;
  days: readonly number[];
}): { cells: number; rooms: number } {
  const nights = datesMatching(input.from, input.to, input.days).length;
  let cells = 0;
  let rooms = 0;
  for (const r of input.rooms) {
    if (!input.roomTypeIds.includes(r.id)) continue;
    const plans = input.planCodes ? r.plans.filter((p) => input.planCodes!.includes(p)).length : 1;
    if (!plans || !nights) continue;
    rooms += 1;
    cells += plans * nights;
  }
  return { cells, rooms };
}

/** "12,400", "₹12,400" or "12400" typed into a cell, as whole rupees; NaN when not a number. */
export function parseRupees(text: string): number {
  const clean = text.replace(/[₹,\s]/g, "");
  if (!/^\d+$/.test(clean)) return Number.NaN;
  return Number(clean);
}

/** Rejected cell message: "At least 3 (already sold or held)" or "At most 8 (total rooms)". */
export function rejectionMessage(r: {
  min: number;
  cap: number;
  reason: "BELOW_COMMITTED" | "ABOVE_TOTAL";
}): string {
  return r.reason === "BELOW_COMMITTED"
    ? `At least ${r.min} (already sold or held)`
    : `At most ${r.cap} (total rooms)`;
}

/** Sold and held under the allotment: spelled out when there is room, letters on narrow screens. */
export function stockLabel(sold: number, held: number) {
  return { full: `${sold} sold · ${held} held`, short: `S ${sold} · H ${held}` };
}

/** Tooltip/tap text: rooms still free to sell on the website that night. */
export function freeLabel(n: { allotment: number; sold: number; held: number }) {
  const free = Math.max(0, n.allotment - n.sold - n.held);
  return `${free} free to sell (allotment ${n.allotment}, ${n.sold} sold, ${n.held} held)`;
}
