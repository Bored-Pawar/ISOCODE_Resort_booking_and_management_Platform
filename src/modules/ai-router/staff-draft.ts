/**
 * Inbox (Q5, Q6) draft step, additive: re-runs only quote and draft, never classification or
 * routing. Prices still come only from `pricing.quote` through `selectQuote`; the prose guard and
 * templates are the same as R4. Nothing is sent from here.
 */
import { todayIST } from "@/lib/dates";
import { buildDraft } from "./draft";
import { groundExtraction } from "./grounding";
import { PROMPT_VERSION } from "./prompts";
import { namedRoomTypes, preferredRoomStatus, selectQuote } from "./quote-selection";
import type { Classification } from "./schema";

/**
 * Booking facts a staff member confirmed in the inbox. They replace the model's dates and party.
 * `room` is the room text to quote: what staff typed, or the guest's own preference when staff
 * left it alone (`roomSource: "message"`). `cleared` means staff removed the room on purpose, so
 * the draft asks the guest instead of guessing (production QA-01).
 */
export type StaffFacts = {
  dates?: { from: string; to: string } | null;
  guests?: { adults: number; children: number } | null;
  room?: string | null;
  roomSource?: "message" | "staff" | "cleared";
};

/** Staff facts as plain evidence lines, read by the same server grounding as a guest message. */
export function factsText(facts: StaffFacts): string {
  const lines: string[] = [];
  if (facts.dates) lines.push(`${facts.dates.from} to ${facts.dates.to}`);
  if (facts.guests) {
    lines.push(`${facts.guests.adults} adults`);
    if (facts.guests.children > 0) lines.push(`${facts.guests.children} children`);
  }
  if (facts.room && facts.roomSource !== "cleared") lines.push(facts.room.replace(/\d/g, " "));
  return lines.join("\n");
}

export const ASK_ROOM_LINE =
  "Which room type would you prefer? Our team will check availability and rates for your dates.";
export const CONFIRM_ROOM_LINE =
  "Please confirm the room type you would like. Our team will check availability and rates.";
export function unavailableLine(names: string[], from: string, to: string): string {
  const which = names.join(" or ");
  return `${which} ${names.length > 1 ? "are" : "is"} not available for ${from} to ${to}. Would you like different dates, or should we suggest another room type? No price is quoted and no room is held.`;
}

export type StaffDraft = {
  body: string;
  quote: unknown;
  provider: string;
  model: string | null;
  promptVersion: string;
  usedTemplate: boolean;
};

/**
 * Pricing or availability errors propagate: the caller marks the rebuild failed, so an outage
 * never turns into a draft that looks like "no price" or keeps an old one sendable.
 */
export async function draftForStaff(input: {
  rawText: string;
  senderName: string;
  senderContact: string;
  receivedAt: Date;
  classification: Classification;
  /** Present once staff changed a quote-affecting field; absent means the message is evidence. */
  staffFacts?: StaffFacts | null;
  /** Regenerate asks the model for new prose; a field edit uses the safe template. */
  callModel: boolean;
}): Promise<StaffDraft> {
  const facts = input.staffFacts ?? null;
  const classification: Classification = {
    ...input.classification,
    ...(facts?.dates ? { dates: { ...facts.dates } } : {}),
    ...(facts?.guests
      ? {
          guests: {
            adults: facts.guests.adults,
            children: facts.guests.children,
            total: facts.guests.adults + facts.guests.children,
          },
        }
      : {}),
  };
  const usesFacts = !!facts;
  const evidenceText = usesFacts ? factsText(facts!) : input.rawText;
  // The model reads the guest's original message, so its prose would name the guest's room.
  // When staff replaced or cleared the room, only the template can describe the current facts.
  const roomOverridden = facts?.roomSource === "staff" || facts?.roomSource === "cleared";
  let draftText: string | null = null;
  let provider = "staff";
  let model: string | null = null;
  if (input.callModel && !roomOverridden) {
    const { classifyMessage } = await import("./classify");
    const outcome = await classifyMessage(input).catch(() => null);
    if (outcome?.status === "ok") draftText = outcome.draftText;
    if (outcome) {
      provider = outcome.response.provider;
      model = outcome.response.model;
    }
  }
  const today = todayIST();
  const evidence = groundExtraction(evidenceText, classification, today);
  let quote = null;
  let noQuoteLine: string | undefined;
  if (evidence.eligible && classification.category === "room") {
    const { from, to } = evidence.dates!;
    if (facts?.roomSource === "cleared") noQuoteLine = ASK_ROOM_LINE;
    // A typed room that matches no catalog type would otherwise restrict nothing and quote the
    // cheapest room of any type: ask instead.
    else if (facts?.roomSource === "staff" && !(await namedRoomTypes(facts.room ?? ""))?.length)
      noQuoteLine = CONFIRM_ROOM_LINE;
    else {
      quote = await selectQuote(classification, evidenceText, today);
      if (!quote) {
        const status = await preferredRoomStatus(evidenceText, from, to);
        if (status && !status.names.length) noQuoteLine = CONFIRM_ROOM_LINE;
        else if (status && !status.available) noQuoteLine = unavailableLine(status.names, from, to);
      }
    }
  }
  // An explicit "not available" or "which room?" line must not sit beside model prose that may
  // promise the room: use the safe template for it.
  if (noQuoteLine) draftText = null;
  const draft = buildDraft(
    classification,
    draftText,
    quote,
    evidence,
    usesFacts ? `${input.rawText}\n${evidenceText}` : input.rawText,
    noQuoteLine,
  );
  return {
    body: draft.body,
    quote: draft.quote,
    provider,
    model,
    promptVersion: PROMPT_VERSION,
    usedTemplate: draft.usedTemplate,
  };
}
