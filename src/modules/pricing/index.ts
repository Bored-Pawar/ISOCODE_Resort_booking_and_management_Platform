/** FROZEN CONTRACT (C1/C2). All prices are read from the database through the shared engine. */
import { getDb } from "@/lib/db";
import { readQuote } from "./read";
import { quoteInputSchema, type QuoteInput, type QuoteResult } from "./types";

export * from "./types";
export { computeQuoteHash } from "./hash";
export { quoteFixture, changedQuoteFixture, FIXTURE_IDS } from "./fixtures";

export const pricing = {
  async quote(input: QuoteInput): Promise<QuoteResult> {
    if (!quoteInputSchema.safeParse(input).success) return { ok: false, code: "INVALID_INPUT" };
    return readQuote(getDb(), input);
  },
};
