/**
 * FROZEN CONTRACT (C1/C2). Changing signatures needs scrum master approval.
 * pricing.quote() is the only source of prices in the app. Stub returns fixtures until B1.
 */
import { quoteInputSchema, type QuoteInput, type QuoteResult } from "./types";
import { quoteFixture } from "./fixtures";

export * from "./types";
export { computeQuoteHash } from "./hash";
export { quoteFixture, changedQuoteFixture, FIXTURE_IDS } from "./fixtures";

export const pricing = {
  async quote(input: QuoteInput): Promise<QuoteResult> {
    const parsed = quoteInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    const p = parsed.data;
    return {
      ok: true,
      quote: {
        ...quoteFixture,
        roomTypeId: p.roomTypeId,
        ratePlanId: p.ratePlanId,
        checkIn: p.checkIn,
        checkOut: p.checkOut,
      },
    };
  },
};
