import { describe, expect, it } from "vitest";
import {
  adminWindow,
  bulkPreview,
  clampGridStart,
  datesMatching,
  isWeekend,
  parseRupees,
  previewLine,
  windowError,
} from "./rules";

// 2026-11-08 12:00 IST
const NOW = new Date("2026-11-08T06:30:00Z");

describe("admin window", () => {
  it("runs from today IST for the 180 seeded days", () => {
    expect(adminWindow(NOW)).toEqual({ first: "2026-11-08", last: "2027-05-06" });
  });
  it("uses the IST date just after midnight IST", () => {
    expect(adminWindow(new Date("2026-11-08T18:45:00Z")).first).toBe("2026-11-09");
  });
  it("rejects the past and dates past the horizon", () => {
    expect(windowError("2026-11-07", "2026-11-10", NOW)).toMatch(/past/);
    expect(windowError("2026-11-08", "2027-05-07", NOW)).toMatch(/horizon/);
    expect(windowError("2026-11-08", "2027-05-06", NOW)).toBeNull();
  });
  it("clamps the grid start so 30 days stay inside the window", () => {
    expect(clampGridStart(undefined, NOW)).toBe("2026-11-08");
    expect(clampGridStart("2020-01-01", NOW)).toBe("2026-11-08");
    expect(clampGridStart("garbage", NOW)).toBe("2026-11-08");
    expect(clampGridStart("2026-12-01", NOW)).toBe("2026-12-01");
    expect(clampGridStart("2027-12-01", NOW)).toBe("2027-04-07");
  });
});

describe("weekdays", () => {
  it("weekend nights are Friday and Saturday (seed definition)", () => {
    expect(isWeekend("2026-11-13")).toBe(true); // Fri
    expect(isWeekend("2026-11-14")).toBe(true); // Sat
    expect(isWeekend("2026-11-15")).toBe(false); // Sun
  });
  it("lists only the chosen days, both ends inclusive", () => {
    expect(datesMatching("2026-11-09", "2026-11-22", [5, 6])).toEqual([
      "2026-11-13",
      "2026-11-14",
      "2026-11-20",
      "2026-11-21",
    ]);
    expect(datesMatching("2026-11-13", "2026-11-13", [5])).toEqual(["2026-11-13"]);
    expect(datesMatching("2026-11-14", "2026-11-13", [5, 6])).toEqual([]);
  });
});

describe("bulk preview", () => {
  const rooms = [
    { id: "a", plans: ["EP", "CP", "MAP"] },
    { id: "b", plans: ["EP", "CP"] },
    { id: "c", plans: ["EP"] },
  ];
  it("counts plans with a chosen code times the matching dates", () => {
    // Fri/Sat over two weeks = 4 nights; a: EP+CP = 2, b: EP+CP = 2.
    const p = bulkPreview({
      rooms,
      roomTypeIds: ["a", "b"],
      planCodes: ["EP", "CP"],
      from: "2026-11-09",
      to: "2026-11-22",
      days: [5, 6],
    });
    expect(p).toEqual({ cells: 16, rooms: 2 });
    expect(previewLine(p.cells, p.rooms, ["price", "prices"])).toBe(
      "Updates 16 prices across 2 rooms",
    );
  });
  it("skips rooms without a chosen plan and counts one cell per night without plans", () => {
    expect(
      bulkPreview({
        rooms,
        roomTypeIds: ["c"],
        planCodes: ["MAP"],
        from: "2026-11-09",
        to: "2026-11-09",
        days: [1],
      }),
    ).toEqual({ cells: 0, rooms: 0 });
    expect(
      bulkPreview({
        rooms,
        roomTypeIds: ["c"],
        from: "2026-11-09",
        to: "2026-11-15",
        days: [0, 1],
      }),
    ).toEqual({ cells: 2, rooms: 1 });
    expect(previewLine(1, 1, ["allotment", "allotments"])).toBe(
      "Updates 1 allotment across 1 room",
    );
  });
});

describe("parseRupees", () => {
  it("accepts grouping and the rupee sign, whole rupees only", () => {
    expect(parseRupees("12400")).toBe(12400);
    expect(parseRupees("₹12,400")).toBe(12400);
    expect(parseRupees(" 1,00,000 ")).toBe(100000);
    expect(parseRupees("12.5")).toBeNaN();
    expect(parseRupees("-5")).toBeNaN();
    expect(parseRupees("")).toBeNaN();
  });
});
