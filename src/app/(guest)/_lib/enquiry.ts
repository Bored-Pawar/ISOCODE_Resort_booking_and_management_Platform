/** Group and event enquiries use email until the enquiry form (Q-stories) exists. */
export const ENQUIRY_EMAIL = "reservations@companya.example";

export function enquiryHref(opts: { subject?: string; body?: string } = {}): string {
  const params = new URLSearchParams({ subject: opts.subject ?? "Enquiry" });
  if (opts.body) params.set("body", opts.body);
  // mailto: wants %20, not the "+" that URLSearchParams uses for spaces.
  return `mailto:${ENQUIRY_EMAIL}?${params.toString().replaceAll("+", "%20")}`;
}
