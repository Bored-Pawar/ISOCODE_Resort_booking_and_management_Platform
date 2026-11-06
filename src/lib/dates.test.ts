import { describe, expect, it } from "vitest";
import {
  addDays,
  eachNight,
  formatNightDate,
  formatStay,
  isDateStr,
  nightsBetween,
  todayIST,
} from "./dates";

describe("dates", () => {
  it("validates real calendar dates", () => {
    expect(isDateStr("2026-11-14")).toBe(true);
    expect(isDateStr("2026-02-30")).toBe(false);
    expect(isDateStr("14-11-2026")).toBe(false);
  });
  it("counts nights with exclusive check-out", () => {
    expect(nightsBetween("2026-11-14", "2026-11-16")).toBe(2);
    expect(eachNight("2026-11-14", "2026-11-16")).toEqual(["2026-11-14", "2026-11-15"]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("uses IST for today", () => {
    expect(todayIST(new Date("2026-11-07T19:00:00Z"))).toBe("2026-11-08");
  });
});

describe("date formatting", () => {
  it("formats stays like the copy voice in 05", () => {
    expect(formatNightDate("2026-11-14")).toBe("Sat 14 Nov");
    expect(formatStay("2026-11-14", "2026-11-16")).toBe("Sat 14 Nov to Mon 16 Nov · 2 nights");
    expect(formatStay("2026-11-14", "2026-11-15")).toBe("Sat 14 Nov to Sun 15 Nov · 1 night");
  });
});
