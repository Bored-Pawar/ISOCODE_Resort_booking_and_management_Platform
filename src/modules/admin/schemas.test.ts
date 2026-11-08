import { describe, expect, it } from "vitest";
import {
  createPromoInputSchema,
  fieldErrors,
  setAllotmentInputSchema,
  setOfflineInputSchema,
  setOnlineInputSchema,
  setRatesInputSchema,
} from "./schemas";

const R = "8b0f2c62-4d3b-4a63-9a8e-0b9c1d2e3f40";
const P = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

const range = {
  mode: "range" as const,
  roomTypeIds: [R],
  from: "2026-11-09",
  to: "2026-11-22",
  days: [5, 6],
};

function errorsOf(
  schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } },
  v: unknown,
) {
  const r = schema.safeParse(v);
  if (r.success) return null;
  return fieldErrors(r.error as never);
}

describe("setRatesInputSchema", () => {
  it("accepts a cell and a range", () => {
    expect(
      setRatesInputSchema.safeParse({
        mode: "cells",
        cells: [{ roomTypeId: R, ratePlanId: P, date: "2026-11-09", rupees: 12400 }],
      }).success,
    ).toBe(true);
    expect(
      setRatesInputSchema.safeParse({ ...range, planCodes: ["EP"], rupees: 9000 }).success,
    ).toBe(true);
  });
  it.each([
    [0, "more than ₹0"],
    [-10, "more than ₹0"],
    [12.5, "whole rupees"],
    [500_001, "5,00,000"],
  ])("rejects price %s", (rupees, message) => {
    const e = errorsOf(setRatesInputSchema, { ...range, planCodes: ["EP"], rupees });
    expect(e?.rupees).toContain(message);
  });
  it("accepts the ₹5,00,000 ceiling", () => {
    expect(
      setRatesInputSchema.safeParse({ ...range, planCodes: ["EP"], rupees: 500_000 }).success,
    ).toBe(true);
  });
  it("rejects reversed ranges, empty days, empty selections, bad ids and duplicate cells", () => {
    expect(
      errorsOf(setRatesInputSchema, { ...range, planCodes: ["EP"], rupees: 1, to: "2026-11-01" })
        ?.to,
    ).toMatch(/before/);
    expect(
      errorsOf(setRatesInputSchema, { ...range, planCodes: ["EP"], rupees: 1, days: [] })?.days,
    ).toMatch(/day/);
    expect(
      errorsOf(setRatesInputSchema, { ...range, planCodes: [], rupees: 1 })?.planCodes,
    ).toMatch(/plan/);
    expect(
      errorsOf(setRatesInputSchema, { ...range, planCodes: ["XX"], rupees: 1 }),
    ).not.toBeNull();
    expect(
      errorsOf(setRatesInputSchema, {
        ...range,
        roomTypeIds: ["not-a-uuid"],
        planCodes: ["EP"],
        rupees: 1,
      }),
    ).not.toBeNull();
    const cell = { roomTypeId: R, ratePlanId: P, date: "2026-11-09", rupees: 1 };
    expect(errorsOf(setRatesInputSchema, { mode: "cells", cells: [cell, cell] })?.cells).toMatch(
      /twice/,
    );
    expect(
      errorsOf(setRatesInputSchema, { mode: "cells", cells: [{ ...cell, date: "2026-02-30" }] }),
    ).not.toBeNull();
  });
});

describe("setAllotmentInputSchema", () => {
  it("accepts 0 and whole numbers, rejects negatives and fractions", () => {
    expect(setAllotmentInputSchema.safeParse({ ...range, allotment: 0 }).success).toBe(true);
    expect(errorsOf(setAllotmentInputSchema, { ...range, allotment: -1 })?.allotment).toMatch(
      /negative/,
    );
    expect(errorsOf(setAllotmentInputSchema, { ...range, allotment: 1.5 })?.allotment).toMatch(
      /whole/,
    );
    const cell = { roomTypeId: R, date: "2026-11-09", allotment: 3 };
    expect(setAllotmentInputSchema.safeParse({ mode: "cells", cells: [cell] }).success).toBe(true);
    expect(
      errorsOf(setAllotmentInputSchema, { mode: "cells", cells: [cell, cell] })?.cells,
    ).toMatch(/twice/);
  });
});

describe("offline / online schemas", () => {
  const base = { roomTypeId: R, from: "2026-11-09", to: "2026-11-12" };
  it("requires a reason to go offline, trims it, and allows all rooms (null)", () => {
    expect(errorsOf(setOfflineInputSchema, { ...base, reason: "  " })?.reason).toMatch(/reason/);
    expect(errorsOf(setOfflineInputSchema, { ...base })?.reason).toBeDefined();
    const ok = setOfflineInputSchema.parse({ ...base, roomTypeId: null, reason: "  Pool repair " });
    expect(ok).toMatchObject({ roomTypeId: null, reason: "Pool repair" });
    expect(errorsOf(setOfflineInputSchema, { ...base, reason: "x".repeat(201) })?.reason).toMatch(
      /200/,
    );
  });
  it("rejects reversed ranges both ways", () => {
    expect(
      errorsOf(setOfflineInputSchema, { ...base, to: "2026-11-01", reason: "Repairs" })?.to,
    ).toMatch(/before/);
    expect(errorsOf(setOnlineInputSchema, { ...base, to: "2026-11-01" })?.to).toMatch(/before/);
    expect(setOnlineInputSchema.safeParse(base).success).toBe(true);
  });
});

describe("createPromoInputSchema", () => {
  const promo = {
    code: " monsoon20 ",
    kind: "pct" as const,
    value: 20,
    validFrom: "2026-11-09",
    validTo: "2026-12-31",
    minNights: 2,
    maxUses: null,
  };
  it("uppercases and trims the code", () => {
    expect(createPromoInputSchema.parse(promo).code).toBe("MONSOON20");
  });
  it.each([
    [{ code: "a b" }, "code"],
    [{ code: "AB" }, "code"],
    [{ value: 0 }, "value"],
    [{ value: 101 }, "value"],
    [{ kind: "flat", value: 0 }, "value"],
    [{ kind: "flat", value: 500_001 }, "value"],
    [{ value: 12.5 }, "value"],
    [{ validTo: "2026-11-08" }, "validTo"],
    [{ minNights: 0 }, "minNights"],
    [{ minNights: 15 }, "minNights"],
    [{ maxUses: 0 }, "maxUses"],
  ])("rejects %o on %s", (over, field) => {
    expect(errorsOf(createPromoInputSchema, { ...promo, ...over })?.[field]).toBeDefined();
  });
  it("accepts the edges: 1 and 100 percent, 14 nights, 1 use, flat rupees, same-day validity", () => {
    for (const over of [
      { value: 1 },
      { value: 100 },
      { minNights: 14 },
      { maxUses: 1 },
      { kind: "flat", value: 1500 },
      { validTo: promo.validFrom },
    ])
      expect(createPromoInputSchema.safeParse({ ...promo, ...over }).success).toBe(true);
  });
});
