import { describe, expect, it } from "vitest";
import { fitsRoom } from "./occupancy";

// Plantation Room: max 2 adults, max occupancy 3.
const room = { maxAdults: 2, maxOccupancy: 3 };

describe("B10 occupancy rule", () => {
  it.each([
    [1, 0, true],
    [2, 0, true],
    [2, 1, true], // adults + children = occupancy: fits
    [1, 2, true], // children above the old max_children still fit: not enforced
    [2, 2, false], // one over occupancy
    [3, 0, false], // adults over max_adults even though occupancy has room
    [0, 1, false], // a line needs an adult
    [0, 0, false],
    [1, -1, false],
    [1.5, 0, false],
  ])("%i adults + %i children -> %s", (adults, children, fits) => {
    expect(fitsRoom(room, { adults, children })).toBe(fits);
  });
});
