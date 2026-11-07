import { randomInt } from "node:crypto";

/** No 0/O/1/I so an id read aloud or from a screenshot is not ambiguous. */
export const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ENQUIRY_ID_PATTERN = /^ENQ-[A-HJ-NP-Z2-9]{5}$/;

/** Short random id, `ENQ-XXXXX`. Uniqueness is enforced by the primary key; callers retry. */
export function generateEnquiryId(random: (max: number) => number = randomInt): string {
  let suffix = "";
  for (let i = 0; i < 5; i++) suffix += ID_ALPHABET[random(ID_ALPHABET.length)];
  return `ENQ-${suffix}`;
}
