import { describe, expect, it } from "vitest";
import { computeQuoteHash } from "./hash";
import { quoteFixture } from "./fixtures";

const base = {
  roomTypeId: quoteFixture.roomTypeId,
  ratePlanId: quoteFixture.ratePlanId,
  checkIn: quoteFixture.checkIn,
  checkOut: quoteFixture.checkOut,
  nights: quoteFixture.nights,
  promo: quoteFixture.promo,
};

describe("computeQuoteHash", () => {
  it("is deterministic", () => {
    expect(computeQuoteHash(base)).toBe(computeQuoteHash({ ...base }));
  });
  it("changes when a nightly rate changes", () => {
    const nights = base.nights.map((n, i) =>
      i === 0 ? { ...n, ratePaise: n.ratePaise + 100 } : n,
    );
    expect(computeQuoteHash({ ...base, nights })).not.toBe(computeQuoteHash(base));
  });
  it("changes when the GST slab changes", () => {
    const nights = base.nights.map((n, i) => (i === 1 ? { ...n, gstBp: 1800 } : n));
    expect(computeQuoteHash({ ...base, nights })).not.toBe(computeQuoteHash(base));
  });
  it("changes with promo, plan and dates", () => {
    const h = computeQuoteHash(base);
    expect(
      computeQuoteHash({ ...base, promo: { code: "WELCOME10", kind: "pct", value: 10 } }),
    ).not.toBe(h);
    expect(computeQuoteHash({ ...base, ratePlanId: "rp-other" })).not.toBe(h);
    expect(computeQuoteHash({ ...base, checkOut: "2026-11-17" })).not.toBe(h);
  });
});
