/** A5 list filters from the URL. Untrusted: anything unreadable is dropped, never an error. */
import { isDateStr } from "@/lib/dates";
import type { BookingStatus } from "@/modules/booking";

export const STATUSES: BookingStatus[] = ["HELD", "CONFIRMED", "EXPIRED", "CANCELLED"];

export type BookingFilters = {
  tab: "bookings" | "refunds";
  status?: BookingStatus;
  checkInFrom?: string;
  checkInTo?: string;
};

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseFilters(raw: Raw): BookingFilters {
  const out: BookingFilters = { tab: first(raw.tab) === "refunds" ? "refunds" : "bookings" };
  const status = first(raw.status) as BookingStatus;
  if (STATUSES.includes(status)) out.status = status;
  const from = first(raw.from);
  const to = first(raw.to);
  if (isDateStr(from)) out.checkInFrom = from;
  if (isDateStr(to)) out.checkInTo = to;
  // A reversed range is swapped, so a slip of the date picker still shows something sensible.
  if (out.checkInFrom && out.checkInTo && out.checkInFrom > out.checkInTo)
    [out.checkInFrom, out.checkInTo] = [out.checkInTo, out.checkInFrom];
  return out;
}

export const STATUS_TONE: Record<BookingStatus, "success" | "warning" | "neutral" | "danger"> = {
  CONFIRMED: "success",
  HELD: "warning",
  EXPIRED: "neutral",
  CANCELLED: "danger",
};
