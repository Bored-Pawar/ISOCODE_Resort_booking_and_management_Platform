import type { Quote } from "@/modules/pricing";
import { formatInr } from "@/lib/money";
import type { Classification } from "./schema";
import { normalizeDraft, safeModelDraft } from "./price-guard";
import { safeTemplate } from "./templates";
export function buildDraft(
  classification: Classification,
  modelDraft: unknown,
  quote: Quote | null,
) {
  const room = classification.category === "room";
  const safe = safeModelDraft(modelDraft, room);
  const template = safe ? normalizeDraft(modelDraft) : safeTemplate(classification.category);
  const price = quote
    ? `From ${formatInr(quote.totalPaise)} for your dates (room only, including ${formatInr(quote.gstPaise)} GST). This is an indicative live quote, subject to availability; no room is held.`
    : "Please confirm your dates, adults, children and preferred room type. Our team will check availability and rates.";
  return { body: template.replaceAll("{{QUOTE}}", price), quote, usedTemplate: !safe };
}
