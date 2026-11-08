import { describe, expect, it } from "vitest";
import { twoRoomQuoteFixture } from "@/modules/pricing/fixtures";
import { continueState, counter, lineIssues, toCartQuote, type RoomOption } from "./book";
import type { CartLine } from "./cart";

const plantation: RoomOption = {
  id: "rt-p",
  slug: "plantation-room",
  name: "Plantation Room",
  maxAdults: 2,
  maxOccupancy: 3,
  freeUnits: 2,
  plans: [{ id: "rp-p", name: "Room only", inclusions: "No meals", refundable: true }],
};
const villa: RoomOption = {
  ...plantation,
  id: "rt-v",
  slug: "garden-villa",
  name: "Garden Villa",
  maxAdults: 3,
  maxOccupancy: 5,
  freeUnits: 1,
  plans: [{ id: "rp-v", name: "Room only", inclusions: "No meals", refundable: true }],
};
const rooms = [plantation, villa];
const p = (adults: number, children = 0): CartLine => ({
  roomTypeId: "rt-p",
  ratePlanId: "rp-p",
  adults,
  children,
});
const v = (adults: number, children = 0): CartLine => ({
  roomTypeId: "rt-v",
  ratePlanId: "rp-v",
  adults,
  children,
});
const okQuote = { ok: true as const, quote: twoRoomQuoteFixture };

describe("lineIssues", () => {
  it("accepts a valid mixed cart", () => {
    expect(lineIssues(rooms, [p(2, 1), v(3, 2)], okQuote)).toEqual([null, null]);
  });
  it("checks room, plan, adults and occupancy per line", () => {
    expect(
      lineIssues(
        rooms,
        [{ ...p(1), roomTypeId: "gone" }, { ...p(1), ratePlanId: "rp-v" }, p(0, 1), p(3), p(2, 2)],
        null,
      ),
    ).toEqual([
      "Choose a room.",
      "Choose a plan.",
      "Each room needs at least 1 adult.",
      "This room takes at most 2 adults.",
      "This room takes up to 3 guests.",
    ]);
  });
  it("never lets lines of a type exceed its free units, flagging only the extra lines", () => {
    expect(lineIssues(rooms, [v(1), p(1), v(1)], null)).toEqual([
      null,
      null,
      "Only 1 Garden Villa is free for these dates.",
    ]);
    expect(lineIssues(rooms, [p(1), p(1), p(1)], null)[2]).toBe(
      "Only 2 Plantation Rooms are free for these dates.",
    );
    expect(lineIssues([{ ...villa, freeUnits: 0 }], [v(1)], null)).toEqual([
      "The Garden Villa is not free for these dates.",
    ]);
  });
  it("puts a server pricing error on the line it names (lineIndex)", () => {
    const issues = lineIssues(rooms, [p(1), v(1)], { ok: false, code: "NO_RATE", lineIndex: 1 });
    expect(issues[0]).toBeNull();
    expect(issues[1]).toMatch(/no price/);
  });
});

describe("counter", () => {
  it("counts guests left to place from the original search", () => {
    expect(counter({ adults: 5, children: 1 }, [p(2)])).toEqual({
      kind: "left",
      text: "3 adults and 1 child left to place",
    });
    expect(counter({ adults: 2, children: 0 }, [p(2)])).toEqual({ kind: "placed" });
    expect(counter({ adults: 2, children: 0 }, [p(2, 1)])).toEqual({
      kind: "over",
      text: "1 child more than your search",
    });
  });
});

describe("continueState", () => {
  const base = { rooms, party: { adults: 5, children: 3 }, quote: okQuote, pending: false };
  it("allows continue only when every guest is placed and the quote is valid", () => {
    expect(continueState({ ...base, lines: [p(2, 1), v(3, 2)] })).toEqual({ ok: true });
  });
  it("blocks with a reason otherwise", () => {
    const reason = (s: ReturnType<typeof continueState>) => (s.ok ? "" : s.reason);
    expect(reason(continueState({ ...base, lines: [] }))).toMatch(/Add a room/);
    expect(reason(continueState({ ...base, lines: [p(2, 1)] }))).toMatch(/Place every guest/);
    expect(reason(continueState({ ...base, lines: [p(2, 1), v(3, 2), p(1)] }))).toMatch(
      /more than your search/,
    );
    expect(reason(continueState({ ...base, lines: [p(2, 1), v(3, 2)], pending: true }))).toMatch(
      /Updating/,
    );
    expect(
      reason(
        continueState({
          ...base,
          lines: [p(2, 1), v(3, 2)],
          quote: { ok: false, code: "PROMO_INVALID" },
        }),
      ),
    ).toMatch(/could not price/);
    expect(reason(continueState({ ...base, lines: [p(3), v(3, 2)] }))).toMatch(/Fix the rooms/);
    expect(reason(continueState({ ...base, lines: Array(5).fill(p(1)) }))).toMatch(/up to 4/);
  });
});

describe("toCartQuote", () => {
  it("keeps lineIndex only when present", () => {
    expect(toCartQuote({ ok: false, code: "NO_RATE", lineIndex: 0 })).toEqual({
      ok: false,
      code: "NO_RATE",
      lineIndex: 0,
    });
    expect(toCartQuote({ ok: false, code: "INVALID_INPUT" })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(toCartQuote(null)).toBeNull();
  });
});
