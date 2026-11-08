import { describe, expect, it } from "vitest";
import { computeQuoteHash, type HashInput } from "./hash";
import { quoteFixture, twoRoomQuoteFixture } from "./fixtures";

const base: HashInput = {
  checkIn: quoteFixture.checkIn,
  checkOut: quoteFixture.checkOut,
  promo: quoteFixture.promo,
  lines: quoteFixture.lines,
};
const two: HashInput = { ...base, lines: twoRoomQuoteFixture.lines };

describe("computeQuoteHash", () => {
  it("is deterministic and matches the fixtures", () => {
    expect(computeQuoteHash(base)).toBe(computeQuoteHash({ ...base }));
    expect(computeQuoteHash(base)).toBe(quoteFixture.quoteHash);
    expect(computeQuoteHash(two)).toBe(twoRoomQuoteFixture.quoteHash);
  });
  it("changes when a nightly rate changes", () => {
    const lines = base.lines.map((l) => ({
      ...l,
      nights: l.nights.map((n, i) => (i === 0 ? { ...n, ratePaise: n.ratePaise + 100 } : n)),
    }));
    expect(computeQuoteHash({ ...base, lines })).not.toBe(computeQuoteHash(base));
  });
  it("changes when the GST slab changes", () => {
    const lines = base.lines.map((l) => ({
      ...l,
      nights: l.nights.map((n, i) => (i === 1 ? { ...n, gstBp: 1800 } : n)),
    }));
    expect(computeQuoteHash({ ...base, lines })).not.toBe(computeQuoteHash(base));
  });
  it("changes with promo, plan and dates", () => {
    const h = computeQuoteHash(base);
    expect(
      computeQuoteHash({ ...base, promo: { code: "WELCOME10", kind: "pct", value: 10 } }),
    ).not.toBe(h);
    expect(
      computeQuoteHash({ ...base, lines: [{ ...base.lines[0], ratePlanId: "rp-other" }] }),
    ).not.toBe(h);
    expect(computeQuoteHash({ ...base, checkOut: "2026-11-17" })).not.toBe(h);
  });
  it("B10: line order changes the hash; a second line changes it; occupancy does not", () => {
    expect(computeQuoteHash({ ...two, lines: [...two.lines].reverse() })).not.toBe(
      computeQuoteHash(two),
    );
    expect(computeQuoteHash(two)).not.toBe(computeQuoteHash(base));
    const moreGuests = twoRoomQuoteFixture.lines.map((l) => ({ ...l, adults: 1, children: 2 }));
    expect(computeQuoteHash({ ...two, lines: moreGuests })).toBe(computeQuoteHash(two));
  });
});
