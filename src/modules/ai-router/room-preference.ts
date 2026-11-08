/** Aliases only for the four existing catalog types. Original message is server-only input. */
const aliases: Record<string, string[]> = {
  "plantation-room": ["plantation room", "plantation kamra", "प्लांटेशन रूम", "प्लांटेशन कमरा"],
  "estate-suite": ["estate suite", "estate suit", "एस्टेट सुइट", "एस्टेट सूट"],
  "garden-villa": [
    "garden villa",
    "garden wala villa",
    "bagiche wala villa",
    "गार्डन विला",
    "बगीचे वाला विला",
  ],
  "pool-villa": [
    "pool villa",
    "pool wala villa",
    "swimming pool villa",
    "पूल विला",
    "पूल वाला विला",
    "स्विमिंग पूल विला",
  ],
};
export function roomPreference(text: string) {
  const normalized = text.normalize("NFKC").toLowerCase().replace(/[-_]/g, " ");
  const named = Object.entries(aliases)
    .filter(([, names]) =>
      names.some((name) =>
        new RegExp(`(?<![\\p{L}\\p{M}])${name}(?![\\p{L}\\p{M}])`, "u").test(normalized),
      ),
    )
    .map(([slug]) => slug);
  const kind = /\bprivate pool\b|निजी पूल/u.test(normalized)
    ? "pool villa"
    : /\bvillas?\b|विला/u.test(normalized)
      ? "villa"
      : /\bsuites?\b|सुइट|सूट/u.test(normalized)
        ? "suite"
        : null;
  return { named, kind };
}
