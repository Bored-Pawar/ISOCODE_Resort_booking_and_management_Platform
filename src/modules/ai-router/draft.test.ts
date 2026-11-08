import { describe, expect, it } from "vitest";
import { safeModelDraft } from "./price-guard";
import { buildDraft as draftWithEvidence } from "./draft";
import { groundExtraction } from "./grounding";
import { classificationFixtures } from "./fixtures";
import { quoteFixture } from "@/modules/pricing";
const villa = {
  ...classificationFixtures["ENQ-4411"].classification,
  guests: { adults: 2, children: 0, total: 2 },
};
const evidence = groundExtraction(
  "14-16 Nov 2026 for 2 adults and no children",
  villa,
  "2026-11-08",
);
const buildDraft = (...args: Parameters<typeof draftWithEvidence>) =>
  draftWithEvidence(args[0], args[1], args[2], evidence);
describe("draft safety", () => {
  it("a safe template cannot attach a quote without grounding", () => {
    const result = draftWithEvidence(villa, null, quoteFixture);
    expect(result.quote).toBeNull();
    expect(result.body).not.toContain("₹");
  });
  it("discloses omitted children in the trusted quote basis", () => {
    const value = { ...villa, guests: { adults: 2 } };
    const result = draftWithEvidence(
      value,
      null,
      { ...quoteFixture, roomNames: ["Plantation Room"] },
      groundExtraction("14-16 Nov for 2 adults", value, "2026-11-08"),
    );
    expect(result.body).toContain(
      "Quoted for 2026-11-14 to 2026-11-16, 2 adults, child count not supplied",
    );
    expect(result.body).toContain("Plantation Room");
    expect(result.body).not.toContain("0 children");
    expect(result.quote).toEqual(quoteFixture);
    expect(result.quote).not.toHaveProperty("roomNames");
  });
  it("fills canonicalized placeholders and still rejects disguised model prices", () => {
    const draft = buildDraft(villa, "Thank you. ｛｛QUO\u200bTE｝｝", quoteFixture);
    expect(draft.usedTemplate).toBe(false);
    expect(draft.body).toContain("From ₹");
    expect(draft.body).not.toMatch(/QUOTE|｛|\u200b/);
    expect(
      buildDraft(villa, "Thank you. R\u200bs ï¼‘ï¼’ï¼“ {{QUOTE}}", quoteFixture).usedTemplate,
    ).toBe(true);
  });
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
  ])("rejects invented offer: %s", (price) => {
    expect(safeModelDraft(`Thank you. ${price}. {{QUOTE}}`, true)).toBe(false);
  });
  it("allows legitimate dates, headcounts and booking IDs", () => {
    expect(
      safeModelDraft(
        "For 2026-11-14 to 2026-11-16, 2 adults and 1 child, reference ENQ-4411. {{QUOTE}}",
        true,
        {
          evidence: groundExtraction(
            "2026-11-14 to 2026-11-16 for 2 adults and 1 child",
            { ...villa, guests: { adults: 2, children: 1 } },
            "2026-11-08",
          ),
          rawText: "ENQ-4411",
        },
      ),
    ).toBe(true);
    expect(
      safeModelDraft("For 14-16 Nov, 2 nights and 3 guests. {{QUOTE}}", true, {
        evidence: groundExtraction(
          "14-16 Nov for 2 adults and 1 child",
          { ...villa, guests: { adults: 2, children: 1 } },
          "2026-11-08",
        ),
      }),
    ).toBe(true);
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
