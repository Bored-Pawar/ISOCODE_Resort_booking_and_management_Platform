/** Validate model prose BEFORE adding server prices. Dates/headcounts/booking refs are permitted. */
export const normalizeDraft = (value: string) =>
  value.normalize("NFKC").replace(/[\u200b-\u200f\ufeff]/g, "");

export function safeModelDraft(input: unknown, needsQuote: boolean): input is string {
  if (typeof input !== "string" || input.trim().length < 10 || input.length > 2500) return false;
  const value = normalizeDraft(input);
  if (
    /\b(?:available|guarantee|plantation room|estate suite|garden villa|pool villa)\b|\bwe (?:have|can offer)\b/i.test(
      value,
    )
  )
    return false;
  const tokens = value.match(/\{\{QUOTE\}\}/g) ?? [];
  if (needsQuote ? tokens.length !== 1 : tokens.length !== 0) return false;
  if (
    /[₹$€£%]|\b(?:rs\.?|inr|usd|eur|gbp|rupees?|rupaye|rupiya|paise|dollars?|euros?|pounds?|thousand|hundred|lakhs?|crores?|percent|discount|complimentary|free|pay|payment|cost|tariff|charged?|refund(?:ed)?|guaranteed|confirmed|reserved|booked|sent)\b/i.test(
      value,
    )
  )
    return false;
  if (/\b\d[\d,]*(?:\.\d+)?\s*(?:k|lakh|crore|per\s+(?:night|room|person))\b/i.test(value))
    return false;
  if (/<|>|https?:|\bwww\.|\[[^\]]*\]\(|\{(?!\{QUOTE\}\})/i.test(value.replaceAll("{{QUOTE}}", "")))
    return false;
  const unlabelled = value
    .replace(/\b(?:CA|ENQ)-[a-z\d-]+\b/gi, "")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
    .replace(
      /\b\d{1,2}(?:\s*[-–]\s*\d{1,2})?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s+20\d{2})?\b/gi,
      "",
    )
    .replace(/\b\d+\s*(?:adults?|children|child|guests?|people|rooms?|nights?|days?)\b/gi, "");
  if (/\d/.test(unlabelled)) return false;
  return true;
}
