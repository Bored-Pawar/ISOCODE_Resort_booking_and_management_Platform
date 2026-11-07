import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

function token(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`Token --${name} not found`);
  return m[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("design tokens", () => {
  it("text on accent is white, per docs/05", () => {
    expect(token("accent-foreground").toLowerCase()).toBe("#ffffff");
  });
  it("primary button text meets AA (4.5:1) at rest and on hover", () => {
    expect(contrast(token("accent-foreground"), token("accent"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("accent-foreground"), token("accent-hover"))).toBeGreaterThanOrEqual(4.5);
  });
});
