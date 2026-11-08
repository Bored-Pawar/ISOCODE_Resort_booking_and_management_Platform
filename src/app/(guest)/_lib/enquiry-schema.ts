/** Server side validation for the guest enquiry form (Q2). Not imported by client code. */
import { z } from "zod";
import { nightsBetween } from "@/lib/dates";
import { isDateStr } from "@/lib/dates";
import { CONTACT_ERROR, isUsableContact } from "@/modules/enquiries";
import { ENQUIRY_LIMITS } from "./enquiry";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalCount = (max: number, label: string) =>
  z.preprocess(
    blank,
    z.coerce
      .number({ error: `${label} must be a number` })
      .int(`${label} must be a whole number`)
      .min(0, `${label} cannot be negative`)
      .max(max, `${label} looks too high. Tell us in the message instead`)
      .optional(),
  );
const optionalDate = z.preprocess(
  blank,
  z.string().refine(isDateStr, "Enter a valid date").optional(),
);

export function buildEnquirySchema(today: string) {
  return z
    .object({
      name: z.string().trim().min(2, "Enter your name").max(120),
      contact: z.string().trim().max(200).refine(isUsableContact, CONTACT_ERROR),
      message: z
        .string()
        .trim()
        .min(10, "Tell us a little more (at least 10 characters)")
        .max(2000, "Please keep the message under 2000 characters"),
      checkIn: optionalDate,
      checkOut: optionalDate,
      adults: optionalCount(ENQUIRY_LIMITS.maxAdults, "Adults"),
      children: optionalCount(ENQUIRY_LIMITS.maxChildren, "Children"),
      room: z.preprocess(blank, z.string().max(60).optional()),
      consent: z.literal("on", { error: "Please accept the privacy notice to continue" }),
      /** Honeypot: real people never see or fill it. */
      website: z.string().max(200).optional(),
    })
    .superRefine((v, ctx) => {
      if (v.checkIn && v.checkIn < today) {
        ctx.addIssue({
          code: "custom",
          path: ["checkIn"],
          message: "Check-in cannot be in the past",
        });
      }
      if (v.checkIn && !v.checkOut) {
        ctx.addIssue({ code: "custom", path: ["checkOut"], message: "Add a check-out date too" });
      }
      if (v.checkOut && !v.checkIn) {
        ctx.addIssue({ code: "custom", path: ["checkIn"], message: "Add a check-in date too" });
      }
      if (v.checkIn && v.checkOut) {
        if (v.checkOut <= v.checkIn) {
          ctx.addIssue({
            code: "custom",
            path: ["checkOut"],
            message: "Check-out must be after check-in",
          });
        } else if (nightsBetween(v.checkIn, v.checkOut) > ENQUIRY_LIMITS.maxNights) {
          ctx.addIssue({
            code: "custom",
            path: ["checkOut"],
            message: `Stays up to ${ENQUIRY_LIMITS.maxNights} nights. Tell us about longer plans in the message`,
          });
        }
      }
    });
}

export type EnquiryForm = z.infer<ReturnType<typeof buildEnquirySchema>>;

/**
 * The text stored as `raw_text`. The model reads only this (04), so dates and party size go in as
 * plain lines after the guest's own words. Contact details are never part of it.
 */
export function composeRawText(v: EnquiryForm, roomName?: string): string {
  const lines: string[] = [];
  if (v.checkIn && v.checkOut) lines.push(`Dates: ${v.checkIn} to ${v.checkOut}`);
  const party = [
    v.adults !== undefined ? `${v.adults} adult${v.adults === 1 ? "" : "s"}` : null,
    v.children ? `${v.children} child${v.children === 1 ? "" : "ren"}` : null,
  ].filter(Boolean);
  if (party.length) lines.push(`Guests: ${party.join(", ")}`);
  if (roomName) lines.push(`Room of interest: ${roomName}`);
  return lines.length ? `${v.message}\n\n${lines.join("\n")}` : v.message;
}
