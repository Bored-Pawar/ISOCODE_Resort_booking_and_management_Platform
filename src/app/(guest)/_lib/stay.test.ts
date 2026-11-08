import { describe, expect, it } from "vitest";
import { fitsRoom } from "@/lib/occupancy";
import type { RoomOption } from "./book";
import type { CartLine } from "./cart";
import {
  addBlockedReason,
  partyForRoom,
  roomsForEnquiry,
  roomsLeftToAdd,
  splitAcross,
  suggestCart,
} from "./stay";

const plan = (id: string) => ({ id, name: id, inclusions: "", refundable: true });
const room = (id: string, maxAdults: number, maxOccupancy: number, freeUnits = 10): RoomOption => ({
  id,
  slug: id,
  name: id,
  maxAdults,
  maxOccupancy,
  freeUnits,
  plans: [plan(`${id}-ep`), plan(`${id}-cp`)],
  defaultPlanId: `${id}-cp`,
});
// Seed shapes: Plantation 2/3, Suite 3/4, Garden 3/5, Pool 4/6.
const P = room("P", 2, 3);
const S = room("S", 3, 4);
const G = room("G", 3, 5);
const V = room("V", 4, 6);
const all = [P, S, G, V];

function fitsAll(rooms: RoomOption[], lines: CartLine[]) {
  return lines.every((l) =>
    fitsRoom(
      rooms.find((r) => r.id === l.roomTypeId)!,
      l,
    ),
  );
}
const sum = (lines: CartLine[]) => ({
  adults: lines.reduce((s, l) => s + l.adults, 0),
  children: lines.reduce((s, l) => s + l.children, 0),
});

describe("partyForRoom", () => {
  it("keeps the search party when it fits", () => {
    expect(partyForRoom(S, { adults: 2, children: 1 })).toEqual({ adults: 2, children: 1 });
  });
  it("caps a big search to the room: adults first, then children in the space left", () => {
    expect(partyForRoom(P, { adults: 8, children: 0 })).toEqual({ adults: 2, children: 0 });
    expect(partyForRoom(P, { adults: 1, children: 5 })).toEqual({ adults: 1, children: 2 });
    expect(partyForRoom(V, { adults: 6, children: 3 })).toEqual({ adults: 4, children: 2 });
  });
  it("always gives at least one adult", () => {
    expect(partyForRoom(P, { adults: 0, children: 0 })).toEqual({ adults: 1, children: 0 });
  });
});

describe("stock per type", () => {
  const two = room("T", 2, 3, 2);
  const line = (id: string): CartLine => ({
    roomTypeId: id,
    ratePlanId: "x",
    adults: 1,
    children: 0,
  });
  it("counts the cart against free units", () => {
    expect(roomsLeftToAdd(two, [])).toBe(2);
    expect(roomsLeftToAdd(two, [line("T")])).toBe(1);
    expect(roomsLeftToAdd(two, [line("T"), line("T"), line("T")])).toBe(0);
  });
  it("explains why Add room is off", () => {
    expect(addBlockedReason(two, [])).toBeNull();
    expect(addBlockedReason(room("Z", 2, 3, 0), [])).toMatch(/Not available/);
    expect(addBlockedReason(two, [line("T"), line("T")])).toMatch(/All free rooms/);
    expect(addBlockedReason(two, [line("A"), line("B"), line("C"), line("D")])).toMatch(/4 rooms/);
  });
});

describe("splitAcross", () => {
  it("puts one adult in each room, then spreads the rest within limits", () => {
    expect(splitAcross([P, S], { adults: 4, children: 1 })).toEqual([
      { adults: 2, children: 0 },
      { adults: 2, children: 1 },
    ]);
  });
  it("returns null when the rooms cannot take the party", () => {
    expect(splitAcross([P], { adults: 3, children: 0 })).toBeNull();
    expect(splitAcross([P, P], { adults: 1, children: 0 })).toBeNull();
    expect(splitAcross([P], { adults: 2, children: 2 })).toBeNull();
  });
});

describe("suggestCart", () => {
  it("one room when one room fits, with the least spare space", () => {
    const lines = suggestCart(all, { adults: 2, children: 0 })!;
    expect(lines).toEqual([{ roomTypeId: "P", ratePlanId: "P-cp", adults: 2, children: 0 }]);
  });
  it("places 10 people in the fewest rooms, every line fits, nobody is lost", () => {
    const party = { adults: 8, children: 2 };
    const lines = suggestCart(all, party)!;
    expect(lines.length).toBe(2);
    expect(fitsAll(all, lines)).toBe(true);
    expect(sum(lines)).toEqual(party);
  });
  it("never suggests more of a type than is free", () => {
    const rooms = [room("P", 2, 3, 1), room("S", 3, 4, 1), room("G", 3, 5, 0), room("V", 4, 6, 0)];
    const lines = suggestCart(rooms, { adults: 5, children: 0 })!;
    expect(lines.map((l) => l.roomTypeId).sort()).toEqual(["P", "S"]);
    expect(suggestCart(rooms, { adults: 6, children: 0 })).toBeNull();
  });
  it("is null beyond 4 rooms (group enquiry)", () => {
    expect(suggestCart(all, { adults: 17, children: 0 })).toBeNull();
    expect(suggestCart(all, { adults: 20, children: 10 })).toBeNull();
    expect(suggestCart(all, { adults: 16, children: 8 })).toHaveLength(4);
  });
  it("skips sold out types and types without plans", () => {
    const rooms = [room("P", 2, 3, 0), { ...room("S", 3, 4), plans: [] }, G];
    expect(suggestCart(rooms, { adults: 2, children: 0 })![0].roomTypeId).toBe("G");
  });
});

describe("roomsForEnquiry", () => {
  it("uses the cart when it has rooms, else a rule of thumb", () => {
    const l: CartLine = { roomTypeId: "P", ratePlanId: "x", adults: 1, children: 0 };
    expect(roomsForEnquiry(all, { adults: 30, children: 0 }, [l, l])).toBe(2);
    expect(roomsForEnquiry(all, { adults: 30, children: 0 }, [])).toBe(8);
    expect(roomsForEnquiry(all, { adults: 10, children: 20 }, [])).toBe(5);
  });
});
