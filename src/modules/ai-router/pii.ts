const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Minimize message input, including contact details embedded in forwarded text/signatures. */
export function redactPii(
  text: string,
  identity: { senderName?: string; senderContact?: string } = {},
): string {
  let clean = text;
  for (const value of [identity.senderContact, identity.senderName]) {
    if (value?.trim()) clean = clean.replace(new RegExp(escape(value.trim()), "gi"), "[REDACTED]");
  }
  if (identity.senderName)
    for (const part of identity.senderName.split(/\s+/).filter((p) => p.length >= 3))
      clean = clean.replace(new RegExp(`\\b${escape(part)}\\b`, "gi"), "[NAME]");
  return clean
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .replace(
      /\b(?:my name is|name\s*:|regards\s*[,.:]?|contact person\s*:)\s*[\p{L}][\p{L} .'-]{1,70}/giu,
      "[NAME]",
    )
    .replace(
      /\b(?:@[a-z][\w.]{2,}|[\w.-]+@(?:upi|ok\w+)|(?:passport|aadhaar|aadhar|pan|contact\s*id)\s*[:#-]?\s*[\w-]+)/gi,
      "[CONTACT_ID]",
    )
    // Split dates out before phone scanning, so an adjacent ID/phone cannot swallow a stay date.
    .split(/(\b\d{4}-\d{2}-\d{2}\b)/)
    .map((part) => /^\d{4}-\d{2}-\d{2}$/.test(part) ? part : part.replace(/(?<![a-z\d])\+?\d[\d ().-]{7,}\d/gi,
      (value) => value.replace(/\D/g, "").length >= 9 ? "[PHONE_OR_ID]" : value))
    .join("");
}
