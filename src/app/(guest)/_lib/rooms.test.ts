import { describe, expect, it } from "vitest";
import { roomTypesFixture } from "@/modules/catalog/fixtures";
import { partyFitsNoRoom } from "./rooms";

const [plantation, , , pool] = roomTypesFixture;

describe("partyFitsNoRoom", () => {
  it("detects a party that no mix of types can take within 4 rooms", () => {
    expect(partyFitsNoRoom(roomTypesFixture, { adults: 8, children: 4 })).toBe(false);
    expect(partyFitsNoRoom(roomTypesFixture, { adults: 30, children: 0 })).toBe(true);
    expect(partyFitsNoRoom([plantation], { adults: 8, children: 5 })).toBe(true);
    expect(partyFitsNoRoom([pool], { adults: 8, children: 5 })).toBe(false);
    // a mix of types can take a party that no single type can within 4 rooms
    const adultsRoom = { ...pool, id: "a", maxAdults: 4, maxOccupancy: 4 };
    const familyRoom = { ...pool, id: "f", maxAdults: 1, maxOccupancy: 10 };
    const party = { adults: 7, children: 10 };
    expect(partyFitsNoRoom([adultsRoom], party)).toBe(true);
    expect(partyFitsNoRoom([familyRoom], party)).toBe(true);
    expect(partyFitsNoRoom([adultsRoom, familyRoom], party)).toBe(false);
    expect(partyFitsNoRoom([adultsRoom, familyRoom], { adults: 17, children: 0 })).toBe(true);
  });
  it("is false for an empty catalog (nothing to enquire about)", () => {
    expect(partyFitsNoRoom([], { adults: 2, children: 0 })).toBe(false);
  });
});
