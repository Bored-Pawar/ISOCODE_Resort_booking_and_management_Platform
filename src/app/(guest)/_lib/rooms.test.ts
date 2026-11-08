import { describe, expect, it } from "vitest";
import { roomTypesFixture } from "@/modules/catalog/fixtures";
import { quoteFixture } from "@/modules/pricing/fixtures";
import { classifyRoom, freeUnits, partyFitsNoRoom, partyPlan, type PlanQuote } from "./rooms";

const [plantation, , , pool] = roomTypesFixture; // occupancy 3 (2 adults), 6 (4 adults)
const free = { availableUnits: 3, soldOut: false, blackedOut: false };
const q = (total: number): PlanQuote => ({
  planId: `p${total}`,
  planName: `Plan ${total}`,
  quote: { ...quoteFixture, totalPaise: total },
});

describe("classifyRoom", () => {
  it("is available with the cheapest plan, for one room", () => {
    const item = classifyRoom({
      room: plantation,
      availability: free,
      party: { adults: 2, children: 0 },
      quotes: [q(900), q(500), q(700)],
    });
    expect(item).toMatchObject({ kind: "available", plansPriced: 3, rooms: 1 });
    if (item.kind === "available") expect(item.cheapest.quote.totalPaise).toBe(500);
  });

  it("B10: a party too big for one room is offered several rooms of the type", () => {
    const item = classifyRoom({
      room: plantation,
      availability: free,
      party: { adults: 3, children: 0 },
      quotes: [q(900)],
    });
    expect(item).toMatchObject({ kind: "available", rooms: 2 });
    // 2 adults + 1 child now fits one room: occupancy 3, max_children no longer enforced at 1.
    expect(
      classifyRoom({
        room: plantation,
        availability: free,
        party: { adults: 1, children: 2 },
        quotes: [q(1)],
      }),
    ).toMatchObject({ kind: "available", rooms: 1 });
  });

  it("is short when fewer units are free than the party needs of this type", () => {
    expect(
      classifyRoom({
        room: plantation,
        availability: { ...free, availableUnits: 1 },
        party: { adults: 4, children: 0 },
        quotes: [],
      }),
    ).toEqual({ kind: "short", room: plantation, rooms: 2, availableUnits: 1 });
  });

  it("flags over-occupancy (more than 4 rooms) before anything else, even when sold out", () => {
    const item = classifyRoom({
      room: plantation,
      availability: { ...free, soldOut: true },
      party: { adults: 8, children: 5 },
      quotes: [],
    });
    expect(item.kind).toBe("over-occupancy");
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
      expect(freeUnits(availability)).toBe(0);
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

describe("partyPlan and partyFitsNoRoom", () => {
  it("prices only rooms that can take the party with the stock that is free", () => {
    expect(partyPlan(plantation, free, { adults: 2, children: 0 })).toEqual([
      { adults: 2, children: 0 },
    ]);
    expect(partyPlan(plantation, free, { adults: 3, children: 1 })).toEqual([
      { adults: 2, children: 0 },
      { adults: 1, children: 1 },
    ]);
    expect(
      partyPlan(plantation, { ...free, availableUnits: 1 }, { adults: 3, children: 0 }),
    ).toBeNull();
    expect(
      partyPlan(plantation, { ...free, soldOut: true }, { adults: 2, children: 0 }),
    ).toBeNull();
  });

  it("detects a party that no type can take within 4 rooms", () => {
    expect(partyFitsNoRoom(roomTypesFixture, { adults: 8, children: 4 })).toBe(false);
    expect(partyFitsNoRoom([plantation], { adults: 8, children: 5 })).toBe(true);
    expect(partyFitsNoRoom([pool], { adults: 8, children: 5 })).toBe(false);
  });
});
