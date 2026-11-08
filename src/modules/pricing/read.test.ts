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
