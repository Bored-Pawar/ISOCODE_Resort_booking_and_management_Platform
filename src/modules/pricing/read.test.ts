import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { readQuote } from "./read";
import type { QuoteInput } from "./types";

/** Any database call fails the test: these cases must be decided before the query. */
const noDb = new Proxy({} as Db, {
  get() {
    throw new Error("database must not be touched");
  },
});
const room = {
  roomTypeId: "6f1c1c1e-4a3b-4c6d-8e9f-0a1b2c3d4e5f",
  ratePlanId: "7f1c1c1e-4a3b-4c6d-8e9f-0a1b2c3d4e5f",
  adults: 2,
  children: 0,
};
const stay = (rooms: QuoteInput["rooms"]): QuoteInput => ({
  checkIn: "2099-11-14",
  checkOut: "2099-11-16",
  rooms,
});

describe("B10 quote input", () => {
  it("accepts 1 to 4 lines; 0 or 5 lines is INVALID_INPUT", async () => {
    expect(await readQuote(noDb, stay([]))).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(await readQuote(noDb, stay(Array(5).fill(room)))).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
  });
  it("rejects a line with no adult or bad counts as INVALID_INPUT", async () => {
    expect(await readQuote(noDb, stay([room, { ...room, adults: 0 }]))).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(await readQuote(noDb, stay([{ ...room, children: -1 }]))).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
  });
  it("reports NO_RATE with the lineIndex of the first malformed line", async () => {
    expect(
      await readQuote(noDb, stay([room, room, { ...room, roomTypeId: "not-a-uuid" }])),
    ).toEqual({ ok: false, code: "NO_RATE", lineIndex: 2 });
    expect(await readQuote(noDb, stay([{ ...room, ratePlanId: "x" }, room]))).toEqual({
      ok: false,
      code: "NO_RATE",
      lineIndex: 0,
    });
  });
});

describe("NO_RATE from a missing tax slab", () => {
  const A = "6f1c1c1e-4a3b-4c6d-8e9f-0a1b2c3d4e5f";
  const B = "8f1c1c1e-4a3b-4c6d-8e9f-0a1b2c3d4e5f";
  const rates = (pricePaise: number) => [
    { date: "2099-11-14", pricePaise },
    { date: "2099-11-15", pricePaise },
  ];
  const lineRow = (idx: number, pricePaise: number) => ({
    idx,
    found: true,
    maxAdults: 4,
    maxOccupancy: 4,
    rates: rates(pricePaise),
  });
  // Slabs end at Rs 7,500: only the second line's Rs 8,000 nights are uncovered.
  const db = {
    execute: async () => [
      {
        lines: [lineRow(0, 400000), lineRow(1, 800000)],
        slabs: [{ minPaise: 0, maxPaise: 750000, gstBp: 500, effectiveFrom: "2025-09-22" }],
        promo: null,
      },
    ],
  } as unknown as Db;

  it("returns the lineIndex of the line with no slab, not a bare NO_RATE", async () => {
    const result = await readQuote(db, stay([room, { ...room, roomTypeId: A, ratePlanId: B }]));
    expect(result).toEqual({ ok: false, code: "NO_RATE", lineIndex: 1 });
  });
});
