import { describe, expect, it } from "vitest";
import { safeModelDraft } from "./price-guard";
import { groundExtraction } from "./grounding";
import { classificationFixtures } from "./fixtures";
const classification = classificationFixtures["ENQ-4411"].classification;
const context = {
  rawText: "Pool Villa 14-16 Nov for 2 adults and 1 child. My budget is INR 30000.",
  evidence: groundExtraction("14-16 Nov for 2 adults and 1 child", classification, "2026-11-08"),
};
describe("multilingual draft guard", () => {
  it.each([
    "विला का दाम ५००० रुपये है।",
    "कमरे की कीमत रु ५००० है।",
    "The room is ₹५००० per night.",
    "आपका कमरा पक्का है।",
    "आपका विला कन्फर्म है।",
    "आपका कमरा बुक हो गया है।",
    "Aapki booking pakki ho gayi hai.",
    "We have rooms for your dates.",
    "A villa is available for you.",
    "We can accommodate your family.",
    "We will issue a refund.",
    "We will reimburse and compensate you.",
    "We'll refund the amount.",
    "Our team will investigate and process your refund promptly.",
    "You will get your money back.",
    "We guarantee availability.",
    "We will ensure to meet your budget of INR 30000.",
    "Your refund will be processed.",
    "We have refunded you.",
    "Our room rate is Rs 5000.",
    "The villa is pachas hazaar.",
    "Your budget of INR 40000 is noted.",
    "Thank you for your enquiry. {{QUOTE}} {{QUOTE}}",
  ])("rejects unsupported commitment/amount: %s", (text) => {
    expect(safeModelDraft(`${text} {{QUOTE}}`, true, context)).toBe(false);
  });
  it.each([
    "We have received your enquiry.",
    "Feel free to share your preferences.",
    "Your request for 2 adults on 14 Nov is noted.",
    "Your request for २ adults on १४ Nov is noted.",
    "We noted your Pool Villa preference.",
    "Your budget of INR 30000 is noted.",
    "We are sorry to hear about your refund concern. Our team will review.",
    "Our team will review your refund request.",
  ])("accepts harmless grounded acknowledgment: %s", (text) => {
    expect(safeModelDraft(`${text} {{QUOTE}}`, true, context)).toBe(true);
  });
  it("does not permit invented or merely matching dates/counts", () => {
    expect(safeModelDraft("For 4 adults on 20 Nov. {{QUOTE}}", true, context)).toBe(false);
    expect(safeModelDraft("For five adults on 20 Nov. {{QUOTE}}", true, context)).toBe(false);
    expect(safeModelDraft("For 14-16 Nov. {{QUOTE}}", true)).toBe(false);
    expect(safeModelDraft("For 2 adults on 14 Nov. {{QUOTE}}", true)).toBe(false);
    expect(safeModelDraft("Thank you for your enquiry.", true, context)).toBe(false);
  });
});
