/** Dates are IST calendar dates as "YYYY-MM-DD" strings (Postgres DATE). */
export type DateStr = string;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateStr(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date: DateStr, days: number): DateStr {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Number of nights between check-in and check-out (check-out exclusive). */
export function nightsBetween(checkIn: DateStr, checkOut: DateStr): number {
  const ms = Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Each night's date: check-in inclusive, check-out exclusive. */
export function eachNight(checkIn: DateStr, checkOut: DateStr): DateStr[] {
  const n = nightsBetween(checkIn, checkOut);
  return Array.from({ length: Math.max(n, 0) }, (_, i) => addDays(checkIn, i));
}

/** Today's date in IST. */
export function todayIST(now: Date = new Date()): DateStr {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}
