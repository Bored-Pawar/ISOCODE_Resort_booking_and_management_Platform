import { describe, expect, it } from "vitest";
import { enquiryHref } from "./enquiry";
import {
  formCount,
  needsEnquiry,
  parseSearchParams,
  toSearchParams,
  validateSearch,
  type SearchValues,
} from "./search";

const today = "2026-11-10";
const ok: SearchValues = { checkIn: "2026-11-14", checkOut: "2026-11-16", adults: 2, children: 0 };

describe("validateSearch", () => {
  it("accepts a valid search", () => {
    expect(validateSearch(ok, today)).toBeNull();
  });

  it("accepts check-in today", () => {
    expect(validateSearch({ ...ok, checkIn: today, checkOut: "2026-11-11" }, today)).toBeNull();
  });

  it("asks for both dates", () => {
    expect(validateSearch({ ...ok, checkOut: "" }, today)?.code).toBe("missing-dates");
    expect(validateSearch({ ...ok, checkIn: "nope" }, today)?.code).toBe("missing-dates");
  });

  it("rejects a past check-in", () => {
    expect(validateSearch({ ...ok, checkIn: "2026-11-09" }, today)?.code).toBe("past");
  });

  it("rejects check-out on or before check-in", () => {
    expect(validateSearch({ ...ok, checkOut: ok.checkIn }, today)?.code).toBe("order");
    expect(validateSearch({ ...ok, checkOut: "2026-11-12" }, today)?.code).toBe("order");
  });

  it("allows 14 nights and rejects 15", () => {
    expect(
      validateSearch({ ...ok, checkIn: "2026-11-14", checkOut: "2026-11-28" }, today),
    ).toBeNull();
    expect(
      validateSearch({ ...ok, checkIn: "2026-11-14", checkOut: "2026-11-29" }, today)?.code,
    ).toBe("too-long");
  });

  it("takes check-in up to 3 calendar months ahead; the stay may end later", () => {
    expect(
      validateSearch({ ...ok, checkIn: "2027-02-10", checkOut: "2027-02-14" }, today),
    ).toBeNull();
    const far = validateSearch({ ...ok, checkIn: "2027-02-11", checkOut: "2027-02-12" }, today);
    expect(far?.code).toBe("too-far");
    expect(far?.message).toBe(
      "Online booking opens 3 months ahead. For later dates, send us an enquiry.",
    );
    expect(needsEnquiry(far)).toBe(true);
    expect(needsEnquiry(validateSearch({ ...ok, checkIn: "2026-11-09" }, today))).toBe(false);
  });

  it("needs at least one adult and caps the party at 24 guests", () => {
    expect(validateSearch({ ...ok, adults: 0 }, today)?.code).toBe("no-adults");
    expect(validateSearch({ ...ok, adults: 9, children: 5 }, today)).toBeNull();
    expect(validateSearch({ ...ok, adults: 24, children: 0 }, today)).toBeNull();
    expect(validateSearch({ ...ok, adults: 20, children: 5 }, today)?.code).toBe("too-many-guests");
    expect(validateSearch({ ...ok, adults: 25 }, today)?.code).toBe("too-many-guests");
  });

  it("rejects unreadable counts instead of defaulting them", () => {
    expect(validateSearch({ ...ok, adults: Number.NaN }, today)?.code).toBe("bad-guests");
    expect(validateSearch({ ...ok, children: Number.NaN }, today)?.code).toBe("bad-guests");
    expect(validateSearch({ ...ok, children: -1 }, today)?.code).toBe("bad-guests");
  });
});

describe("search params", () => {
  it("round trips through the URL", () => {
    const qs = toSearchParams(ok).toString();
    expect(qs).toBe("checkIn=2026-11-14&checkOut=2026-11-16&adults=2&children=0");
    expect(parseSearchParams(Object.fromEntries(new URLSearchParams(qs)))).toEqual(ok);
  });

  it("falls back on malformed dates and defaults only absent counts", () => {
    expect(parseSearchParams({ checkIn: "2026-13-45", checkOut: ["x"] })).toEqual({
      checkIn: "",
      checkOut: "",
      adults: 2,
      children: 0,
    });
  });

  it("marks present but unreadable counts as invalid, never as the default", () => {
    const v = parseSearchParams({ adults: "-1", children: "abc" });
    expect(Number.isNaN(v.adults)).toBe(true);
    expect(Number.isNaN(v.children)).toBe(true);
    expect(validateSearch({ ...ok, adults: v.adults, children: v.children }, today)?.code).toBe(
      "bad-guests",
    );
  });

  it("takes the first value of a repeated param and keeps counts as requested", () => {
    expect(
      parseSearchParams({ checkIn: ["2026-11-14", "2026-12-01"], adults: "9", children: "5" }),
    ).toMatchObject({ checkIn: "2026-11-14", adults: 9, children: 5 });
    expect(parseSearchParams({ adults: "99" }).adults).toBe(99);
  });

  it("keeps the requested counts in the group enquiry link", () => {
    const v = parseSearchParams({
      ...Object.fromEntries(new URLSearchParams(toSearchParams(ok))),
      adults: "30",
      children: "2",
    });
    expect(validateSearch(v, today)?.code).toBe("too-many-guests");
    expect(enquiryHref(v)).toContain("adults=30&children=2");
  });

  it("shows form defaults without clamping the party", () => {
    expect(formCount(30, 2)).toBe(2);
    expect(formCount(Number.NaN, 2)).toBe(2);
    expect(formCount(9, 2)).toBe(9);
  });
});
