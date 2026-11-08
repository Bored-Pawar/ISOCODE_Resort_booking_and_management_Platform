/**
 * Guest channel rule (S2 runbook item 1b): direct online booking takes a check-in no later than
 * today (IST) plus 3 calendar months. The stay may end after that date. Not an inventory rule:
 * staff and enquiries are unaffected, and service contracts do not check it.
 */
import type { DateStr } from "./dates";

export const BOOKING_WINDOW_MONTHS = 3;

export const BOOKING_WINDOW_MESSAGE =
  "Online booking opens 3 months ahead. For later dates, send us an enquiry.";

/**
 * Last check-in date bookable online: same day of the month, 3 calendar months on. When that month
 * is shorter, its last day (30 Nov -> 28 Feb, or 29 Feb in a leap year; 31 Aug -> 30 Nov).
 */
export function lastOnlineCheckIn(today: DateStr): DateStr {
  const [y, m, d] = today.split("-").map(Number);
  const monthIndex = m - 1 + BOOKING_WINDOW_MONTHS;
  const year = y + Math.floor(monthIndex / 12);
  const month = monthIndex % 12; // 0-based
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** True when this check-in may be booked online today. */
export function withinBookingWindow(checkIn: DateStr, today: DateStr): boolean {
  return checkIn <= lastOnlineCheckIn(today);
}
