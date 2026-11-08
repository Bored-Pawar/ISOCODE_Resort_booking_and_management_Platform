/**
 * Links to, and prefill for, the guest enquiry form (/enquire). Pure and dependency free so client
 * and server code can share it. Params: checkIn, checkOut (IST dates), adults, children, room (slug).
 */
import { isDateStr } from "@/lib/dates";

export const ENQUIRY_LIMITS = { maxAdults: 500, maxChildren: 200, maxNights: 90 } as const;

export type EnquiryPrefill = {
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  children?: number;
  /** Room type slug, for context only. */
  room?: string;
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function enquiryHref(opts: EnquiryPrefill = {}): string {
  const params = new URLSearchParams();
  if (opts.checkIn && isDateStr(opts.checkIn)) params.set("checkIn", opts.checkIn);
  if (opts.checkOut && isDateStr(opts.checkOut)) params.set("checkOut", opts.checkOut);
  if (Number.isInteger(opts.adults)) params.set("adults", String(opts.adults));
  if (Number.isInteger(opts.children)) params.set("children", String(opts.children));
  if (opts.room && SLUG_RE.test(opts.room)) params.set("room", opts.room);
  const qs = params.toString();
  return qs ? `/enquire?${qs}` : "/enquire";
}

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function toCount(raw: string, max: number): number | undefined {
  if (!/^\d{1,3}$/.test(raw)) return undefined;
  return Math.min(Number(raw), max);
}

/** Reads untrusted URL params. Anything malformed is dropped, never an error. */
export function parseEnquiryParams(raw: RawParams): EnquiryPrefill {
  const checkIn = first(raw.checkIn);
  const checkOut = first(raw.checkOut);
  const room = first(raw.room);
  const out: EnquiryPrefill = {};
  if (isDateStr(checkIn)) out.checkIn = checkIn;
  if (isDateStr(checkOut)) out.checkOut = checkOut;
  const adults = toCount(first(raw.adults), ENQUIRY_LIMITS.maxAdults);
  const children = toCount(first(raw.children), ENQUIRY_LIMITS.maxChildren);
  if (adults !== undefined && adults >= 1) out.adults = adults;
  if (children !== undefined) out.children = children;
  if (room.length <= 60 && SLUG_RE.test(room)) out.room = room;
  return out;
}

/** Carries the rooms search (a query string such as the one RoomCard holds) over to /enquire. */
export function enquiryHrefFromQuery(query: string, room?: string): string {
  return enquiryHref({
    ...parseEnquiryParams(Object.fromEntries(new URLSearchParams(query))),
    room,
  });
}
