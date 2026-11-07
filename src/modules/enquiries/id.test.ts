import { describe, expect, it } from "vitest";
import { ENQUIRY_ID_PATTERN, ID_ALPHABET, generateEnquiryId } from "./id";
import { normaliseContact, tidyText } from "./normalise";

describe("generateEnquiryId", () => {
  it("has the ENQ-XXXXX shape and avoids ambiguous characters", () => {
    for (let i = 0; i < 500; i++) expect(generateEnquiryId()).toMatch(ENQUIRY_ID_PATTERN);
    expect(ID_ALPHABET).not.toMatch(/[01OI]/);
  });
  it("maps the injected random source onto the alphabet", () => {
    expect(generateEnquiryId(() => 0)).toBe("ENQ-AAAAA");
    expect(generateEnquiryId(() => ID_ALPHABET.length - 1)).toBe("ENQ-99999");
  });
  it("is not a sequence", () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateEnquiryId()));
    expect(ids.size).toBeGreaterThan(195);
  });
});

describe("normaliseContact", () => {
  it("lower-cases emails and trims", () => {
    expect(normaliseContact("  Meera.Nair@Example.COM ")).toBe("meera.nair@example.com");
  });
  it("strips phone separators but keeps one leading +", () => {
    expect(normaliseContact("+91 98765-43210")).toBe("+919876543210");
    expect(normaliseContact("(080) 2345 6789")).toBe("08023456789");
  });
});

describe("tidyText", () => {
  it("normalises line endings and blank runs", () => {
    expect(tidyText("  Hi\r\n\r\n\r\n\r\nthere   you  ")).toBe("Hi\n\nthere you");
  });
});
