/**
 * Contact normalisation for the one `enquiries` row. Emails are lower-cased; phone numbers lose
 * spaces, dashes and brackets and keep a single leading "+".
 */
export function normaliseContact(raw: string): string {
  const value = raw.trim();
  if (value.includes("@")) return value.toLowerCase();
  const plus = value.startsWith("+") ? "+" : "";
  return plus + value.replace(/[^0-9]/g, "");
}

/** Collapse runs of blank space so inbox previews and the AI input stay tidy. Keeps line breaks. */
export function tidyText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
