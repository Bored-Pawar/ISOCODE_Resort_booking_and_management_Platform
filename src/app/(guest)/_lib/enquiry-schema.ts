/** Server side validation for the guest enquiry form (Q2). Not imported by client code. */
import { z } from "zod";
import { nightsBetween } from "@/lib/dates";
import { isDateStr } from "@/lib/dates";
import { formatInr, rupeesToPaise } from "@/lib/money";
import {
  CONTACT_ERROR,
  EVENT_NEEDS,
  GUEST_HINTS,
  isUsableContact,
  type EventInput,
} from "@/modules/enquiries";
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
/** Event budget in whole rupees: positive, and inside `event_details.budget_paise` (int). */
export const MAX_BUDGET_INR = 2_00_00_000;
export const MAX_EVENT_GUESTS = 5000;

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
      rooms: optionalCount(ENQUIRY_LIMITS.maxRooms, "Rooms"),
      consent: z.literal("on", { error: "Please accept the privacy notice to continue" }),
      /** Q2: "What is it about?" A hint for staff only; routing still comes from the text. */
      about: z.preprocess(blank, z.enum(GUEST_HINTS).optional()),
      eventFrom: optionalDate,
      eventTo: optionalDate,
      eventGuests: z.preprocess(
        blank,
        z.coerce
          .number({ error: "Guests must be a number" })
          .int("Guests must be a whole number")
          .min(1, "At least one guest")
          .max(MAX_EVENT_GUESTS, "That looks too high. Tell us in the message instead")
          .optional(),
      ),
      budget: z.preprocess(
        (v) => (typeof v === "string" ? blank(v.replace(/[,\s₹]/g, "")) : v),
        z.coerce
          .number({ error: "Budget must be a number in rupees" })
          .int("Budget must be whole rupees")
          .positive("Budget must be more than zero")
          .max(MAX_BUDGET_INR, "That looks too high. Tell us in the message instead")
          .optional(),
      ),
      needs: z.array(z.enum(EVENT_NEEDS)).max(EVENT_NEEDS.length).default([]),
      /** Honeypot: real people never see or fill it. */
      website: z.string().max(200).optional(),
    })
    .superRefine((v, ctx) => {
      if (v.about === "wedding" || v.about === "offsite") {
        if (v.eventFrom && v.eventFrom < today)
          ctx.addIssue({
            code: "custom",
            path: ["eventFrom"],
            message: "The event date cannot be in the past",
          });
        if (v.eventTo && !v.eventFrom)
          ctx.addIssue({ code: "custom", path: ["eventFrom"], message: "Add the first day too" });
        if (v.eventFrom && v.eventTo && v.eventTo < v.eventFrom)
          ctx.addIssue({
            code: "custom",
            path: ["eventTo"],
            message: "The last day must be on or after the first",
          });
      }
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
  if (v.rooms) lines.push(`Rooms: ${v.rooms}`);
  if (roomName) lines.push(`Room of interest: ${roomName}`);
  lines.push(...eventLines(eventInput(v)));
  return lines.length ? `${v.message}\n\n${lines.join("\n")}` : v.message;
}

const isEvent = (v: EnquiryForm) => v.about === "wedding" || v.about === "offsite";

/**
 * Event fields for `event_details`, or null when the guest did not choose a wedding or event or
 * filled none of its fields. Other choices never store event fields.
 */
export function eventInput(v: EnquiryForm): EventInput | null {
  if (!isEvent(v)) return null;
  const filled =
    !!v.eventFrom || v.eventGuests !== undefined || v.budget !== undefined || v.needs.length > 0;
  if (!filled) return null;
  return {
    eventType: v.about as "wedding" | "offsite",
    dateFrom: v.eventFrom ?? null,
    dateTo: v.eventFrom ? (v.eventTo ?? v.eventFrom) : null,
    guests: v.eventGuests ?? null,
    budgetPaise: v.budget !== undefined ? rupeesToPaise(v.budget) : null,
    needs: [...new Set(v.needs)],
  };
}

/** Event fields as plain lines. The choice itself is not added: it must not steer the AI. */
export function eventLines(e: EventInput | null): string[] {
  if (!e) return [];
  const lines: string[] = [];
  if (e.dateFrom)
    lines.push(
      e.dateTo && e.dateTo !== e.dateFrom
        ? `Event dates: ${e.dateFrom} to ${e.dateTo}`
        : `Event date: ${e.dateFrom}`,
    );
  if (e.guests !== null) lines.push(`Event guests: ${e.guests}`);
  if (e.budgetPaise !== null) lines.push(`Budget: ${formatInr(e.budgetPaise)}`);
  if (e.needs.length) lines.push(`Needs: ${e.needs.join(", ")}`);
  return lines;
}
