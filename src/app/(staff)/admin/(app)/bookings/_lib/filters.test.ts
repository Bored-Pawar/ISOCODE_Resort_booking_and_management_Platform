import { describe, expect, it } from "vitest";
import { parseFilters } from "./filters";

describe("parseFilters", () => {
  it("reads tab, status and a check-in range", () => {
    expect(
      parseFilters({ tab: "refunds", status: "HELD", from: "2026-11-01", to: "2026-11-30" }),
    ).toEqual({
      tab: "refunds",
      status: "HELD",
      checkInFrom: "2026-11-01",
      checkInTo: "2026-11-30",
    });
  });
  it("drops unreadable values and swaps a reversed range", () => {
    expect(parseFilters({ tab: "x", status: "PAID", from: "nope" })).toEqual({ tab: "bookings" });
    expect(parseFilters({ from: "2026-12-01", to: "2026-11-01" })).toMatchObject({
      checkInFrom: "2026-11-01",
      checkInTo: "2026-12-01",
    });
  });
});
