/**
 * Guest stay search: URL params <-> values, and validation. Pure and dependency free so the
 * client form (G1) and the server pages (G2, G3) share one definition. Dates are IST DATE strings.
 */
import { isDateStr, nightsBetween, type DateStr } from "@/lib/dates";
import { BOOKING_WINDOW_MESSAGE, withinBookingWindow } from "@/lib/booking-window";

/**
 * Online booking takes a party of up to `maxGuests` that fits in at most 4 rooms (B10). Counts are
 * never clamped: a party outside these rules is told so and offered an enquiry with its real counts.
 */
export const SEARCH_LIMITS = { maxNights: 14, maxGuests: 24 } as const;

export type SearchValues = {
  checkIn: DateStr | "";
  checkOut: DateStr | "";
  adults: number;
  children: number;
};

export type SearchIssue = {
  code:
    | "missing-dates"
    | "past"
    | "order"
    | "too-long"
    | "too-far"
    | "no-adults"
    | "bad-guests"
    | "too-many-guests";
  message: string;
};

export const DEFAULT_GUESTS = { adults: 2, children: 0 } as const;

/** Issues an enquiry can solve: the page offers a prefilled /enquire link with them. */
export function needsEnquiry(issue: SearchIssue | null): boolean {
  return !!issue && ["too-long", "too-far", "too-many-guests"].includes(issue.code);
}

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
  if (!withinBookingWindow(v.checkIn, today)) {
    return { code: "too-far", message: BOOKING_WINDOW_MESSAGE };
  }
  if (nightsBetween(v.checkIn, v.checkOut) > SEARCH_LIMITS.maxNights) {
    return {
      code: "too-long",
      message: `We take online bookings up to ${SEARCH_LIMITS.maxNights} nights. For a longer stay, send us an enquiry.`,
    };
  }
  if (!Number.isInteger(v.adults) || v.adults < 0) {
    return { code: "bad-guests", message: "Check the number of guests and try again." };
  }
  if (v.adults < 1) {
    return { code: "no-adults", message: "At least one adult needs to be staying." };
  }
  if (!Number.isInteger(v.children) || v.children < 0) {
    return { code: "bad-guests", message: "Check the number of guests and try again." };
  }
  if (v.adults + v.children > SEARCH_LIMITS.maxGuests) {
    return {
      code: "too-many-guests",
      message: `Online booking is for up to ${SEARCH_LIMITS.maxGuests} guests. Booking for a group? Send us an enquiry and we will arrange the rooms.`,
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

/**
 * Absent means the default. Present but unreadable is NaN, which validateSearch reports, so a
 * mangled link is never quietly turned into a different party. Large values are kept as given.
 */
function toCount(raw: string, fallback: number): number {
  if (raw === "") return fallback;
  return /^\d{1,3}$/.test(raw) ? Number(raw) : Number.NaN;
}

/** A count the guest form can show: out-of-range or unreadable values fall back to the default. */
export function formCount(n: number, fallback: number): number {
  return Number.isInteger(n) && n >= 0 && n <= SEARCH_LIMITS.maxGuests ? n : fallback;
}

/** Reads untrusted URL params. Malformed dates become empty; counts are preserved (see toCount). */
export function parseSearchParams(raw: RawParams): SearchValues {
  const checkIn = first(raw.checkIn);
  const checkOut = first(raw.checkOut);
  return {
    checkIn: isDateStr(checkIn) ? checkIn : "",
    checkOut: isDateStr(checkOut) ? checkOut : "",
    adults: toCount(first(raw.adults), DEFAULT_GUESTS.adults),
    children: toCount(first(raw.children), DEFAULT_GUESTS.children),
  };
}
