/**
 * The one booking reference generator (B10 minor fix 1), used by acquireHold and the seed.
 * `CA-` + 5 characters from an alphabet without look-alikes (no I, L, O, 0, 1).
 * Pure: the caller supplies randomness, so the seed stays deterministic.
 */
import { randomInt } from "node:crypto";

export const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const REF_LENGTH = 5;
export const REF_PATTERN = /^CA-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{5}$/;
/** 31^5 is about 28.6 million refs; a few retries make a collision failure negligible. */
export const REF_MAX_ATTEMPTS = 5;

/** `random()` returns a float in [0, 1). Defaults to a CSPRNG. */
export function newBookingRef(random: () => number = () => randomInt(2 ** 31) / 2 ** 31): string {
  let out = "CA-";
  for (let i = 0; i < REF_LENGTH; i++)
    out += REF_ALPHABET[Math.floor(random() * REF_ALPHABET.length)];
  return out;
}

/** True for a unique violation on bookings.ref (PostgreSQL 23505 on the ref constraint). */
export function isRefCollision(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    const e = error as {
      code?: string;
      constraint_name?: string;
      constraint?: string;
      cause?: unknown;
    };
    if (e.code === "23505") return (e.constraint_name ?? e.constraint) === "bookings_ref_unique";
    error = e.cause;
  }
  return false;
}
