import { describe, expect, it } from "vitest";
import { applyBp, assertPaise, formatInr, rupeesToPaise } from "./money";

describe("money", () => {
  it("formats with Indian grouping", () => {
    expect(formatInr(1240000)).toBe("₹12,400");
    expect(formatInr(12345678)).toBe("₹1,23,456.78");
  });
  it("applies basis points in integer paise", () => {
    expect(applyBp(750000, 1200)).toBe(90000);
    expect(applyBp(333, 500)).toBe(17);
  });
  it("rejects non-integers", () => {
    expect(() => assertPaise(10.5)).toThrow();
    expect(rupeesToPaise(19.99)).toBe(1999);
  });
});
