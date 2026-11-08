import { groundedDates, type Grounding } from "./grounding";
import { isDateStr, nightsBetween } from "@/lib/dates";
/** Run before trusted quote substitution. Normalize full-width/Devanagari digits and zero-width text. */
export const normalizeDraft = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/[\u200b-\u200f\ufeff]/g, "")
    .replace(/[०-९]/g, (digit) => String(digit.charCodeAt(0) - 0x966));
export type DraftContext = { evidence?: Grounding; rawText?: string };
const monthNames = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

const countWords = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];
const normalizeCounts = (value: string) =>
  normalizeDraft(value).replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)[ -]+(adults?|children|child|guests?|people|rooms?|nights?|days?)\b/gi,
    (_m, word: string, label: string) => `${countWords.indexOf(word.toLowerCase())} ${label}`,
  );
function maskGroundedFacts(text: string, context: DraftContext) {
  const { evidence, rawText = "" } = context;
  const dates = evidence?.dates;
  const allowed = [
    ...(dates ? [dates.from, dates.to] : []),
    ...(normalizeDraft(rawText).match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? []).filter(isDateStr),
  ];
  let value = normalizeCounts(text).replace(/\b20\d{2}-\d{2}-\d{2}\b/g, (match) =>
    allowed.includes(match) ? "[DATE]" : match,
  );
  value = value.replace(
    /\b\d{1,2}\s*(?:-|–|to)\s*\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s+20\d{2})?\b/gi,
    (match) => {
      const parsed = dates && groundedDates(match, dates.from);
      return parsed && dates && parsed.from === dates.from && parsed.to === dates.to
        ? "[DATES]"
        : match;
    },
  );
  value = value.replace(
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s+(20\d{2}))?\b/gi,
    (match, day: string, mon: string, year?: string) =>
      allowed.some(
        (date) =>
          +date.slice(8) === +day &&
          +date.slice(5, 7) === monthNames.indexOf(mon.toLowerCase()) + 1 &&
          (!year || +date.slice(0, 4) === +year),
      )
        ? "[DATE]"
        : match,
  );
  value = value.replace(
    /\b(\d+)\s*(adults?|children|child|guests?|people|rooms?|nights?|days?)\b/gi,
    (match, count: string, label: string) => {
      const n = +count,
        kind = label.toLowerCase();
      const directlySupplied = new RegExp(`(?<![\\d.\\-+])${n}\\s*${kind}\\b`, "i").test(
        normalizeCounts(rawText),
      );
      const valid =
        directlySupplied ||
        (/^adult/.test(kind)
          ? evidence?.guests?.adults === n
          : /^(?:child)/.test(kind)
            ? evidence?.childrenSupplied && evidence.guests?.children === n
            : /^(?:guest|people)/.test(kind)
              ? evidence?.childrenSupplied &&
                evidence.guests &&
                evidence.guests.adults + evidence.guests.children === n
              : /^(?:night|day)/.test(kind) && dates
                ? nightsBetween(dates.from, dates.to) === n
                : false);
      return valid ? "[COUNT]" : match;
    },
  );
  return value.replace(/\b(?:CA|ENQ)-[a-z\d-]+\b/gi, (match) =>
    rawText.includes(match) ? "[REFERENCE]" : match,
  );
}

function maskBudget(text: string, raw: string) {
  return text.replace(
    /\byour(?: stated)? budget(?: of| is|:)?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+)(?:\s*(?:INR|rupees))?/gi,
    (match, amount: string) => {
      const n = amount.replaceAll(",", "");
      const supplied = [
        ...normalizeDraft(raw).matchAll(
          /\bbudget\b\s*(?:of|is|:)?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+)/gi,
        ),
      ].some((m) => m[1].replaceAll(",", "") === n);
      return supplied ? "[GUEST_BUDGET]" : match;
    },
  );
}

export function safeModelDraft(
  input: unknown,
  needsQuote: boolean,
  context: DraftContext = {},
): input is string {
  if (typeof input !== "string" || input.trim().length < 10 || input.length > 2500) return false;
  const value = normalizeDraft(input).replace(/\b(we|you|i|they)'ll\b/gi, "$1 will");
  const tokens = value.match(/\{\{QUOTE\}\}/g) ?? [];
  if (needsQuote ? tokens.length !== 1 : tokens.length !== 0) return false;
  if (/<|>|https?:|\bwww\.|\[[^\]]*\]\(|[{}]/i.test(value.replaceAll("{{QUOTE}}", "")))
    return false;
  // Guest-perspective requests are not resort replies.
  if (
    /\b(?:i|we) (?:would like|want|need|wish) to book\b|\bplease let me know\b|\b(?:could|can|would) you (?:please )?(?:provide|send|give|quote)[^.!?]{0,25}\b(?:price|rates?|quote)\b/i.test(
      value,
    )
  )
    return false;
  let prose = maskBudget(value, context.rawText ?? "");
  if (
    /\b(?:money|cash|amount)\b[^.!?।]{0,30}\b(?:back|returned|credited)\b|पैसे[^।.!?]{0,25}(?:लौटा|वापस)|\bguarantee\b/i.test(
      prose,
    )
  )
    return false;
  if (
    /\b(?:ensure|guarantee|promise|will)\s+(?:to\s+)?(?:meet|match|fit|honou?r)\b[^.!?।]{0,30}\bbudget\b/i.test(
      value,
    )
  )
    return false;
  if (
    /\b(?:will|shall|can|going to)\b[^.!?।]{0,100}\b(?:issue|process|approve|give|send|arrange|provide|offer|pay)\b[^.!?।]{0,25}\b(?:refund|reimbursement|compensation)\b/i.test(
      prose,
    )
  )
    return false;
  if (
    /\b(?:we|i|team|resort)\b[^.!?।]{0,25}\b(?:refunded|reimbursed|compensated|processed|approved)\b|\bbooking\s+(?:is|has been)\s+(?:done|complete|successful)\b/i.test(
      prose,
    )
  )
    return false;
  // Harmless acknowledgments and requests may mention refunds; promises never pass.
  if (
    /\b(?:will|shall|can|going to|promise(?: to)?|guarantee(?: to)?)\s+(?:(?:be|fully|promptly|immediately|definitely|gladly|certainly)\s+)*(?:(?:issue|process|approve|give|send|arrange|provide|offer|pay|receive|ensure)\s+)?(?:you\s+)?(?:(?:a|your|the|full|complete)\s+)*(?:refund|reimburse\w*|compensat\w*)\b|\b(?:refund|reimbursement|compensation)\b[^.!?।]{0,45}\b(?:issued|processed|approved|guaranteed|arrive|credited|receive|on its way)\b|\bwa?pas\s+(?:karenge|kar denge|milega)\b/i.test(
      prose,
    )
  )
    return false;
  if (
    /(?:पक्का|पक्की|कन्फर्म|कंफर्म|कन्फ़र्म|बुक\s+हो\s+(?:गया|गई)|उपलब्ध\s+(?:है|हैं)|वापस\s+कर|रिफंड[^।.!?]{0,30}(?:मिलेगा|करेंगे))|\b(?:pakka|pakki|confirmed|reserved|booked|guaranteed|available|reimbursed|compensated)\b/i.test(
      prose,
    )
  )
    return false;
  if (
    /\b(?:we (?:can offer|offer|provide|can (?:accommodate|host|reserve|book|confirm)|have (?:an?\s+|some\s+)?(?:rooms?|villas?|suites?|stock))|(?:room|villa|suite)\s+(?:is|will be)\s+(?:free|ready)|complimentary|free\s+(?:upgrade|stay|room)|(?:we|i)\s+(?:have\s+)?sent|pay\s+(?:now|us))\b/i.test(
      prose,
    )
  )
    return false;
  prose = prose.replace(/\bfeel free\b/gi, "");
  if (
    /[₹$€£%]|(?:रुपये|रुपए|रुपया|हज़ार|हजार|लाख|करोड़)|(?:^|\s)रु(?:\s|\.|$)|\b(?:rs\.?|inr|usd|eur|gbp|rupees?|rupaye|rupiya|paise|dollars?|euros?|pounds?|thousand|hundred|lakhs?|crores?|hazaa?r|pachas|percent|discount|tariff)\b/i.test(
      prose,
    )
  )
    return false;
  if (/\b\d[\d,]*(?:\.\d+)?\s*(?:k|per\s+(?:night|room|person))\b/i.test(prose)) return false;
  return !/\p{Nd}/u.test(maskGroundedFacts(prose, context));
}
