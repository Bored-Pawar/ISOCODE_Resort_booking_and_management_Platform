import { describe, expect, it } from "vitest";
import { groundExtraction, groundedDates } from "./grounding";
import { classificationFixtures } from "./fixtures";
const c = classificationFixtures["ENQ-4411"].classification;
const today = "2026-11-08";
describe("server extraction grounding", () => {
  it.each(["Not 14-16 Nov", "Avoid 14-16 Nov", "14-16 Nov is not possible"])(
    "rejects explicitly excluded dates: %s",
    (dates) => {
      expect(groundExtraction(`${dates} for 2 adults and 1 child`, c, today).eligible).toBe(false);
    },
  );
  it.each([
    "14-16 Nov 2026 for 2 adults and a child",
    "14 November to 16 November 2026 for two adults and one child",
    "2026-11-14 to 2026-11-16 for do adults and ek child",
    "From 14/11/2026 to 16/11/2026 for 2 adults and 1 child",
    "Stay 14/11 to 16/11 for 2 adults and 1 child",
    "14–16 Nov for 2 adults and 1 child",
  ])("grounds supported dates and explicit party: %s", (raw) => {
    expect(groundExtraction(raw, c, today)).toMatchObject({
      eligible: true,
      grounding: { dates: "ok", guests: "ok" },
    });
  });
  it.each([
    [
      "2027-02-30 to 2027-03-01 for -2 adults and 1.5 children",
      { dates: { from: "2027-02-28", to: "2027-03-01" } },
    ],
    ["14-16 Nov for -2 adults and 1 child", {}],
    ["14-16 Nov for 2 adults and 1.5 children", {}],
    ["14-16 Nov or 20-22 Nov for 2 adults and 1 child", {}],
    [
      "2026-10-14 to 2026-10-16 for 2 adults and 1 child",
      { dates: { from: "2026-10-14", to: "2026-10-16" } },
    ],
    ["Budget INR 14/11 and Rs 16/11 for 2 adults and 1 child", {}],
    ["Call 9876543210. Budget 2. Dates 14 and 16. One child.", {}],
    ["14-16 Nov for 3 guests", { guests: { adults: 3 } }],
    ["14-16 Nov for 2 adults and our kids", { guests: { adults: 2 } }],
    ["14-16 Nov 2027 for 2 adults and 1 child", {}],
  ])("fails closed on unsupported evidence: %s", (raw, over) => {
    expect(groundExtraction(raw, { ...c, ...over }, today).eligible).toBe(false);
  });
  it("resolves omitted years deterministically and supports December to January", () => {
    expect(groundedDates("14-16 Jan", today)).toEqual({ from: "2027-01-14", to: "2027-01-16" });
    for (const raw of [
      "30 Dec to 2 Jan",
      "30 Dec to 2 Jan 2027",
      "30 Dec 2026 to 2 Jan 2027",
      "30 Dec 2026 to 2 Jan",
    ])
      expect(groundedDates(raw, today)).toEqual({ from: "2026-12-30", to: "2027-01-02" });
    expect(groundedDates("31 Feb to 2 March", today)).toBeNull();
  });
  it("distinguishes omitted children from explicitly zero; never infers adults from total", () => {
    const value = { ...c, guests: { adults: 2 } };
    expect(groundExtraction("14-16 Nov for two adults", value, today)).toMatchObject({
      eligible: true,
      childrenSupplied: false,
    });
    expect(
      groundExtraction(
        "14-16 Nov for two adults and no children",
        { ...value, guests: { adults: 2, children: 0 } },
        today,
      ),
    ).toMatchObject({ eligible: true, childrenSupplied: true });
    expect(groundExtraction("14-16 Nov for two people", value, today).eligible).toBe(false);
  });
  it.each([
    "twenty two adults",
    "minus two adults",
    "- 2 adults",
    "one point two adults",
    "one or two adults",
    "1/2 adults",
    "INR 2 adults",
    "–2 adults",
    "not two adults",
  ])("does not truncate compound/invalid party evidence: %s", (party) => {
    expect(groundExtraction(`14-16 Nov for ${party} and 1 child`, c, today).eligible).toBe(false);
  });
});
