/**
 * Inbox (Q5, Q6) draft step, additive: re-runs only quote and draft, never classification or
 * routing. Prices still come only from `pricing.quote` through `selectQuote`; the prose guard and
 * templates are the same as R4. Nothing is sent from here.
 */
import { todayIST } from "@/lib/dates";
import { buildDraft } from "./draft";
import { groundExtraction } from "./grounding";
import { PROMPT_VERSION } from "./prompts";
import { selectQuote } from "./quote-selection";
import type { Classification } from "./schema";

/** Booking facts a staff member confirmed in the inbox. They replace the model's dates and party. */
export type StaffFacts = {
  dates?: { from: string; to: string } | null;
  guests?: { adults: number; children: number } | null;
  room?: string | null;
};

/** Staff facts as plain evidence lines, read by the same server grounding as a guest message. */
export function factsText(facts: StaffFacts): string {
  const lines: string[] = [];
  if (facts.dates) lines.push(`${facts.dates.from} to ${facts.dates.to}`);
  if (facts.guests) {
    lines.push(`${facts.guests.adults} adults`);
    if (facts.guests.children > 0) lines.push(`${facts.guests.children} children`);
  }
  if (facts.room) lines.push(facts.room.replace(/\d/g, " "));
  return lines.join("\n");
}

export type StaffDraft = {
  body: string;
  quote: unknown;
  provider: string;
  model: string | null;
  promptVersion: string;
  usedTemplate: boolean;
};

export async function draftForStaff(input: {
  rawText: string;
  senderName: string;
  senderContact: string;
  receivedAt: Date;
  classification: Classification;
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
  const usesFacts = !!(facts?.dates || facts?.guests);
  const evidenceText = usesFacts ? factsText(facts!) : input.rawText;
  let draftText: string | null = null;
  let provider = "staff";
  let model: string | null = null;
  if (input.callModel) {
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
  const quote = evidence.eligible
    ? await selectQuote(classification, evidenceText, today).catch(() => null)
    : null;
  const draft = buildDraft(
    classification,
    draftText,
    quote,
    evidence,
    usesFacts ? `${input.rawText}\n${evidenceText}` : input.rawText,
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
