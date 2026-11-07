/**
 * Guest stay search: URL params <-> values, and validation. Pure and dependency free so the
 * client form (G1) and the server pages (G2, G3) share one definition. Dates are IST DATE strings.
 */
import { isDateStr, nightsBetween, type DateStr } from "@/lib/dates";

export const SEARCH_LIMITS = { maxNights: 14, maxAdults: 8, maxChildren: 4 } as const;

export type SearchValues = {
  checkIn: DateStr | "";
  checkOut: DateStr | "";
  adults: number;
  children: number;
};

export type SearchIssue = {
  code: "missing-dates" | "past" | "order" | "too-long" | "no-adults" | "too-many-guests";
  message: string;
};

export const DEFAULT_GUESTS = { adults: 2, children: 0 } as const;

/** First problem with the search, or null when it is valid. `today` is today's IST date. */
export function validateSearch(v: SearchValues, today: DateStr): SearchIssue | null {
  if (!isDateStr(v.checkIn) || !isDateStr(v.checkOut)) {
    return { code: "missing-dates", message: "Choose your check-in and check-out dates." };
  }
  if (v.checkIn < today) {
    return { code: "past", message: "Check-in cannot be in the past" };
  }
  if (v.checkOut <= v.checkIn) {
    return { code: "order", message: "Check-out must be after check-in" };
  }
  if (nightsBetween(v.checkIn, v.checkOut) > SEARCH_LIMITS.maxNights) {
    return {
      code: "too-long",
      message: `We take online bookings up to ${SEARCH_LIMITS.maxNights} nights. For a longer stay, send us an enquiry.`,
    };
  }
  if (!Number.isInteger(v.adults) || v.adults < 1) {
    return { code: "no-adults", message: "At least one adult needs to be staying." };
  }
  if (
    v.adults > SEARCH_LIMITS.maxAdults ||
    v.children < 0 ||
    v.children > SEARCH_LIMITS.maxChildren
  ) {
    return {
      code: "too-many-guests",
      message: "Booking for a group? Send us an enquiry and we will arrange the rooms.",
    };
  }
  return null;
}

/** Query string for the rooms page. Only call with values that passed validateSearch. */
export function toSearchParams(v: SearchValues): URLSearchParams {
  return new URLSearchParams({
    checkIn: v.checkIn,
    checkOut: v.checkOut,
    adults: String(v.adults),
    children: String(v.children),
  });
}

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function toCount(raw: string, fallback: number, max: number): number {
  if (!/^\d{1,2}$/.test(raw)) return fallback;
  return Math.min(Number(raw), max);
}

/** Reads untrusted URL params. Anything malformed falls back to an empty or default value. */
export function parseSearchParams(raw: RawParams): SearchValues {
  const checkIn = first(raw.checkIn);
  const checkOut = first(raw.checkOut);
  return {
    checkIn: isDateStr(checkIn) ? checkIn : "",
    checkOut: isDateStr(checkOut) ? checkOut : "",
    adults: toCount(first(raw.adults), DEFAULT_GUESTS.adults, SEARCH_LIMITS.maxAdults),
    children: toCount(first(raw.children), DEFAULT_GUESTS.children, SEARCH_LIMITS.maxChildren),
  };
}
