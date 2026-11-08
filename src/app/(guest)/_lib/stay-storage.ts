/**
 * Per-browser copy of the guest's stay (dates, group and cart lines), so "Your stay" survives a
 * visit to a room page, a sign in or a new search. The URL stays the source of truth; this is a
 * convenience only. Every access is wrapped: storage can be missing, full or blocked.
 */
import { parseCartParams, stayQuery, type CartLine, type CartStay, type ParsedCart } from "./cart";

export const STAY_STORAGE_KEY = "companya.stay.v1";
/** Fired on window whenever the stored stay changes in this tab (the header badge listens). */
export const STAY_CHANGE_EVENT = "companya:stay-change";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function store(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function notify() {
  try {
    window.dispatchEvent(new Event(STAY_CHANGE_EVENT));
  } catch {
    // no window: nothing listens
  }
}

/** Reads the stored stay through the same parser as the URL, so a tampered value is cleaned. */
export function readStoredStay(s: Store | null = store()): ParsedCart | null {
  try {
    const raw = s?.getItem(STAY_STORAGE_KEY);
    if (!raw) return null;
    const params = new URLSearchParams(raw);
    return parseCartParams({
      checkIn: params.get("checkIn") ?? undefined,
      checkOut: params.get("checkOut") ?? undefined,
      adults: params.get("adults") ?? undefined,
      children: params.get("children") ?? undefined,
      room: params.getAll("room"),
    });
  } catch {
    return null;
  }
}

export function writeStoredStay(stay: CartStay, lines: CartLine[], s: Store | null = store()) {
  try {
    s?.setItem(STAY_STORAGE_KEY, stayQuery(stay, lines).toString());
  } catch {
    // quota or privacy mode: the URL still has the cart
  }
  notify();
}

/** Call once a booking is held: the cart has become a booking. */
export function clearStoredStay(s: Store | null = store()) {
  try {
    s?.removeItem(STAY_STORAGE_KEY);
  } catch {
    // ignore
  }
  notify();
}
