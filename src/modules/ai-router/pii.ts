const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const boundary = (value: string) =>
  new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escape(value)}(?![\\p{L}\\p{M}\\p{N}])`, "giu");
const nameStop =
  /^(?:and|i|we|want|need|would|for|from|with|to|is|the|a|an|in|on|book|please|thanks|pool|garden|plantation|estate|room|villa|suite|adults?|children|aur|hame|chahiye)$/i;
function redactIntroducedNames(text: string) {
  return text
    .replace(/\b(?:my name is|name\s*:|regards\s*[,.:]?|contact person\s*:)\s*/gi, "$&[NAME_START]")
    .replace(/\[NAME_START\]([^\r\n]*)/g, (_all, rest: string) => {
      const tokens = [...rest.matchAll(/[\p{L}\p{M}][\p{L}\p{M}'’.-]*/gu)];
      let end = 0;
      for (const token of tokens.slice(0, 3)) {
        if (nameStop.test(token[0]) || /[^\s]/u.test(rest.slice(end, token.index))) break;
        end = token.index! + token[0].length;
      }
      return end ? `[NAME]${rest.slice(end)}` : rest;
    });
}
/** Minimize message input, including contact details embedded in forwarded text/signatures. */
export function redactPii(
  text: string,
  identity: { senderName?: string; senderContact?: string } = {},
): string {
  let clean = text
    .replace(/^(?:from|to|cc|bcc|sender|reply-to)\s*:.*$/gim, "[CONTACT_HEADER]")
    .replace(/https?:\/\/\S+/gi, "[LINK]");
  for (const value of [identity.senderContact, identity.senderName]) {
    if (value?.trim()) clean = clean.replace(boundary(value.trim()), "[REDACTED]");
  }
  if (identity.senderName)
    for (const part of identity.senderName.split(/\s+/).filter((p) => p.length >= 3))
      clean = clean.replace(boundary(part), "[NAME]");
  clean = redactIntroducedNames(clean);
  return (
    clean
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
      .replace(
        /(?<!\w)(?:@[a-z][\w.]{2,}|[\w.-]+@(?:upi|ok\w+)|(?:passport|aadhaar|aadhar|pan|contact\s*id)\s*[:#-]?\s*[\w-]+)/gi,
        "[CONTACT_ID]",
      )
      // Split dates out before phone scanning, so an adjacent ID/phone cannot swallow a stay date.
      .split(/(\b\d{4}-\d{2}-\d{2}\b)/)
      .map((part) =>
        /^\d{4}-\d{2}-\d{2}$/.test(part)
          ? part
          : part.replace(/(?<![a-z\d])\+?\d[\d ().-]{7,}\d/gi, (value) =>
              value.replace(/\D/g, "").length >= 9 ? "[PHONE_OR_ID]" : value,
            ),
      )
      .join("")
  );
}
