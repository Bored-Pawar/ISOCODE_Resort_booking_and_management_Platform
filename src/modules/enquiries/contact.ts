import { z } from "zod";
import { normaliseContact } from "./normalise";

export const MIN_PHONE_DIGITS = 10;
const PHONE_CHARS = /^\+?[0-9 ()-]+$/;

/**
 * A contact the team can actually reply to: a valid email address, or a phone number that still
 * has at least MIN_PHONE_DIGITS digits after normalisation. Used by the web form and by ingest, so
 * a value like "--------" (which normalises to nothing) never reaches the database.
 */
export function isUsableContact(raw: string): boolean {
  const value = raw.trim();
  if (value.includes("@")) return z.email().safeParse(value).success;
  if (!PHONE_CHARS.test(value)) return false;
  return normaliseContact(value).replace(/\D/g, "").length >= MIN_PHONE_DIGITS;
}

export const CONTACT_ERROR = "Enter a valid email or a phone number with at least 10 digits";
