import { describe, expect, it } from "vitest";
import { roomTypesFixture } from "@/modules/catalog/fixtures";
import { quoteFixture } from "@/modules/pricing";
import { classifyRoom, needsQuote, partyFitsNoRoom, type PlanQuote } from "./rooms";
import { enquiryHref } from "./enquiry";

const [plantation, , , pool] = roomTypesFixture; // 2 adults + 1 child, 4 adults + 2 children
const free = { availableUnits: 3, soldOut: false, blackedOut: false };
const q = (total: number): PlanQuote => ({
  planId: `p${total}`,
  planName: `Plan ${total}`,
  quote: { ...quoteFixture, totalPaise: total },
});

describe("classifyRoom", () => {
  it("is available with the cheapest plan", () => {
    const item = classifyRoom({
      room: plantation,
      availability: free,
      party: { adults: 2, children: 0 },
      quotes: [q(900), q(500), q(700)],
    });
    expect(item.kind).toBe("available");
    if (item.kind === "available") {
      expect(item.cheapest.quote.totalPaise).toBe(500);
      expect(item.plansPriced).toBe(3);
    }
  });

  it("flags over-occupancy before anything else, even when sold out", () => {
    const item = classifyRoom({
      room: plantation,
      availability: { ...free, soldOut: true },
      party: { adults: 3, children: 0 },
      quotes: [],
    });
    expect(item.kind).toBe("over-occupancy");
  });

  it("flags children over the limit too", () => {
    expect(
      classifyRoom({
        room: plantation,
        availability: free,
        party: { adults: 2, children: 2 },
        quotes: [],
      }).kind,
    ).toBe("over-occupancy");
  });

  it("treats sold out, blacked out, zero units and missing availability as sold out", () => {
    const party = { adults: 2, children: 0 };
    for (const availability of [
      { ...free, soldOut: true },
      { ...free, blackedOut: true },
      { ...free, availableUnits: 0 },
      undefined,
    ]) {
      expect(classifyRoom({ room: plantation, availability, party, quotes: [] }).kind).toBe(
        "sold-out",
      );
    }
  });

  it("reports no rates when a free room could not be priced", () => {
    expect(
      classifyRoom({
        room: plantation,
        availability: free,
        party: { adults: 2, children: 0 },
        quotes: [],
      }).kind,
    ).toBe("no-rates");
  });
});

describe("needsQuote and partyFitsNoRoom", () => {
  it("only prices rooms that fit and are free", () => {
    expect(needsQuote(plantation, free, { adults: 2, children: 0 })).toBe(true);
    expect(needsQuote(plantation, free, { adults: 3, children: 0 })).toBe(false);
    expect(needsQuote(plantation, { ...free, soldOut: true }, { adults: 2, children: 0 })).toBe(
      false,
    );
  });

  it("detects a party that fits no room", () => {
    expect(partyFitsNoRoom(roomTypesFixture, { adults: 5, children: 0 })).toBe(true);
    expect(partyFitsNoRoom(roomTypesFixture, { adults: 4, children: 2 })).toBe(false);
    expect(pool.maxAdults).toBe(4);
  });
});

describe("enquiryHref", () => {
  it("encodes spaces as %20 and includes the body", () => {
    const href = enquiryHref({ subject: "Group enquiry", body: "8 adults" });
    expect(href).toBe(
      "mailto:reservations@companya.example?subject=Group%20enquiry&body=8%20adults",
    );
  });
});
