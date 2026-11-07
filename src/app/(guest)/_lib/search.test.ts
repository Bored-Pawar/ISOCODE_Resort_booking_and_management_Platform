import { describe, expect, it } from "vitest";
import { parseSearchParams, toSearchParams, validateSearch, type SearchValues } from "./search";

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

  it("needs at least one adult and caps the party size", () => {
    expect(validateSearch({ ...ok, adults: 0 }, today)?.code).toBe("no-adults");
    expect(validateSearch({ ...ok, adults: 9 }, today)?.code).toBe("too-many-guests");
    expect(validateSearch({ ...ok, children: 5 }, today)?.code).toBe("too-many-guests");
  });
});

describe("search params", () => {
  it("round trips through the URL", () => {
    const qs = toSearchParams(ok).toString();
    expect(qs).toBe("checkIn=2026-11-14&checkOut=2026-11-16&adults=2&children=0");
    expect(parseSearchParams(Object.fromEntries(new URLSearchParams(qs)))).toEqual(ok);
  });

  it("falls back on malformed input", () => {
    expect(
      parseSearchParams({ checkIn: "2026-13-45", checkOut: ["x"], adults: "-1", children: "abc" }),
    ).toEqual({ checkIn: "", checkOut: "", adults: 2, children: 0 });
  });

  it("takes the first value of a repeated param and clamps counts", () => {
    expect(
      parseSearchParams({ checkIn: ["2026-11-14", "2026-12-01"], adults: "99" }),
    ).toMatchObject({
      checkIn: "2026-11-14",
      adults: 8,
    });
  });
});
