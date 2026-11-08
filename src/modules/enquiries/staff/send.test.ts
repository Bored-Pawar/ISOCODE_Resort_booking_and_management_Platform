import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { quoteFigures } from "./send";
import { addsNewPrice } from "./rules";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory()
      ? files(p)
      : /\.tsx?$/.test(f) && !/\.test\./.test(f)
        ? [p]
        : [];
  });
}

describe("never sent without a staff action (hard rule 2)", () => {
  it("only staff/send.ts writes sent_at or approved_by", () => {
    const writers = files(path.resolve("src"))
      .filter((p) => !p.includes(`${path.sep}db${path.sep}`))
      .filter((p) =>
        /\bsentAt:\s*(?:sql|new Date)|\bapprovedBy:\s*actor|\bsent_at\s*=|\bapproved_by\s*=/.test(
          readFileSync(p, "utf8"),
        ),
      )
      .map((p) => path.relative(path.resolve("src"), p).split(path.sep).join("/"));
    expect(writers).toEqual(["modules/enquiries/staff/send.ts"]);
  });
  it("the R2 settlement inserts drafts unapproved and unsent", () => {
    const settle = readFileSync(path.resolve("src/modules/enquiries/internal.ts"), "utf8");
    expect(settle).toMatch(
      /INSERT INTO reply_drafts \(enquiry_id, body, quote, provider, model, prompt_version, edited\)/,
    );
    expect(settle).not.toMatch(/INSERT INTO reply_drafts[^;]*(?:approved_by|sent_at)/);
  });
});

describe("price warning against the server quote", () => {
  const quote = { totalPaise: 2_480_000, gstPaise: 265_714 };
  it("quote figures are the formatted total and GST", () => {
    expect(quoteFigures(quote)).toBe("₹24,800 ₹2,657.14");
    expect(quoteFigures(null)).toBe("");
  });
  it("the quote's own figures pass, a typed discount warns", () => {
    const body = "From ₹24,800 (room only, including ₹2,657.14 GST).";
    expect(addsNewPrice(quoteFigures(quote), body)).toBe(false);
    expect(addsNewPrice(quoteFigures(quote), `${body} For you, ₹20,000.`)).toBe(true);
    expect(addsNewPrice(quoteFigures(null), "Our sales team will follow up.")).toBe(false);
  });
});
