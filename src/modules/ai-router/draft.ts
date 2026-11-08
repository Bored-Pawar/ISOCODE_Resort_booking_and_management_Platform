import type { SelectedQuote } from "./quote-selection";
import type { Grounding } from "./grounding";
import { formatInr } from "@/lib/money";
import type { Classification } from "./schema";
import { normalizeDraft, safeModelDraft } from "./price-guard";
import { safeTemplate } from "./templates";
export function buildDraft(
  classification: Classification,
  modelDraft: unknown,
  quote: SelectedQuote | null,
  evidence?: Grounding,
) {
  // Even the safe template cannot attach a price without grounded booking evidence.
  if (
    !evidence?.eligible ||
    quote?.checkIn !== evidence.dates?.from ||
    quote?.checkOut !== evidence.dates?.to ||
    quote?.lines.reduce((n, line) => n + line.adults, 0) !== evidence.guests?.adults ||
    quote?.lines.reduce((n, line) => n + line.children, 0) !== evidence.guests?.children
  )
    quote = null;
  const room = classification.category === "room";
  const safe = safeModelDraft(modelDraft, room);
  const template = safe ? normalizeDraft(modelDraft) : safeTemplate(classification.category);
  const price = quote
    ? `Quoted for ${quote.checkIn} to ${quote.checkOut}, ${evidence!.guests!.adults} adults, ${evidence!.childrenSupplied ? `${evidence!.guests!.children} children` : "child count not supplied; estimate assumes no children"}, ${quote.roomNames?.join(" + ") ?? quote.lines.map((line) => line.roomTypeId).join(" + ")}: From ${formatInr(quote.totalPaise)} (room only, including ${formatInr(quote.gstPaise)} GST). This is indicative, subject to availability; no room is held.`
    : "Please confirm your dates, adults, children and preferred room type. Our team will check availability and rates.";
  return { body: template.replaceAll("{{QUOTE}}", price), quote, usedTemplate: !safe };
}
