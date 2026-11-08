import { describe, expect, it } from "vitest";
import { safeModelDraft } from "./price-guard";
import { buildDraft } from "./draft";
import { classificationFixtures } from "./fixtures";
import { quoteFixture } from "@/modules/pricing";
const villa = classificationFixtures["ENQ-4411"].classification;
describe("draft safety", () => {
  it.each([
    "₹12000",
    "Rs. 12000",
    "INR 12,000",
    "twelve thousand rupees",
    "20% discount",
    "free upgrade",
    "only 12000 total",
    "USD 50",
    "confirmed",
    "pay now",
    "we sent the email",
    "A villa is available",
    "Pool Villa for your stay",
  ])("rejects invented offer: %s", (price) => {
    expect(safeModelDraft(`Thank you. ${price}. {{QUOTE}}`, true)).toBe(false);
  });
  it("allows legitimate dates, headcounts and booking IDs", () => {
    expect(
      safeModelDraft(
        "For 2026-11-14 to 2026-11-16, 2 adults and 1 child, reference ENQ-4411. {{QUOTE}}",
        true,
      ),
    ).toBe(true);
    expect(safeModelDraft("For 14-16 Nov, 2 nights and 3 guests. {{QUOTE}}", true)).toBe(true);
  });
  it.each([
    null,
    "",
    "{{QUOTE}} {{QUOTE}}",
    "Hello <script>alert(1)</script> {{QUOTE}}",
    "More at https://evil.test {{QUOTE}}",
    "x".repeat(2501),
  ])("replaces unsafe/absent draft without losing classification", (bad) => {
    const draft = buildDraft(villa, bad, quoteFixture);
    expect(draft.usedTemplate).toBe(true);
    expect(draft.quote).toEqual(quoteFixture);
    expect(draft.body).toContain("GST");
    expect(draft.body).toContain("no room is held");
  });
  it("inserts only the trusted total and GST after checking model text", () => {
    const draft = buildDraft(villa, "Thank you for your enquiry. {{QUOTE}}", quoteFixture);
    expect(draft.usedTemplate).toBe(false);
    expect(draft.body).toContain("From ₹");
    expect(draft.body).not.toContain("{{QUOTE}}");
  });
  it("no quote asks for details and makes no availability promise", () => {
    const draft = buildDraft(villa, null, null);
    expect(draft.body).not.toContain("₹");
    expect(draft.body).toContain("confirm your dates");
  });
});
