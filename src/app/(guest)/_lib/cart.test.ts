import { describe, expect, it } from "vitest";
import { roomTypesFixture } from "@/modules/catalog/fixtures";
import { MAX_ROOMS_PER_BOOKING } from "@/modules/pricing/types";
import { fitsRoom } from "@/lib/occupancy";
import {
  MAX_CART_ROOMS,
  detailsHref,
  stayHref,
  decodeLine,
  demandByType,
  encodeLine,
  guestsLeft,
  parseCartParams,
  roomsNeeded,
  splitParty,
  type CartLine,
} from "./cart";

const [plantation, suite, garden, pool] = roomTypesFixture; // occupancy 3, 4, 5, 6
const stay = { checkIn: "2026-11-20", checkOut: "2026-11-22", adults: 5, children: 1 };
const lineA: CartLine = { roomTypeId: "rt-a", ratePlanId: "rp-a", adults: 2, children: 1 };
const lineB: CartLine = { roomTypeId: "rt-b", ratePlanId: "rp-b", adults: 3, children: 0 };

describe("cart limits", () => {
  it("matches the pricing contract maximum", () => {
    expect(MAX_CART_ROOMS).toBe(MAX_ROOMS_PER_BOOKING);
  });
});

describe("roomsNeeded", () => {
  it.each([
    [plantation, 2, 0, 1],
    [plantation, 2, 1, 1], // occupancy 3
    [plantation, 2, 2, 2], // 4 guests over occupancy 3
    [plantation, 3, 0, 2], // max 2 adults
    [plantation, 8, 4, 4], // 4 x (2 adults + 1 child)
    [plantation, 8, 5, null], // would need 5 rooms: group enquiry
    [plantation, 1, 4, null], // children need an adult per room
    [suite, 3, 1, 1],
    [garden, 3, 2, 1],
    [pool, 4, 2, 1],
    [pool, 5, 0, 2],
  ])("%o with %i adults + %i children -> %s", (room, adults, children, n) => {
    expect(roomsNeeded(room, { adults, children })).toBe(n);
  });
});

describe("splitParty", () => {
  it("spreads adults evenly and puts children where there is space; every line fits", () => {
    for (const room of roomTypesFixture)
      for (let adults = 1; adults <= 8; adults++)
        for (let children = 0; children <= 4; children++) {
          const n = roomsNeeded(room, { adults, children });
          if (n === null) continue;
          const lines = splitParty(room, { adults, children }, n);
          expect(lines).toHaveLength(n);
          expect(guestsLeft({ adults, children }, lines)).toEqual({ adults: 0, children: 0 });
          for (const l of lines) expect(fitsRoom(room, l)).toBe(true);
        }
  });
  it("gives 5 adults in 3 plantation rooms as 2, 2, 1", () => {
    expect(splitParty(plantation, { adults: 5, children: 0 }, 3)).toEqual([
      { adults: 2, children: 0 },
      { adults: 2, children: 0 },
      { adults: 1, children: 0 },
    ]);
  });
});

describe("cart URL", () => {
  it("round-trips lines in order and keeps the original search for the counter", () => {
    const href = stayHref(stay, [lineB, lineA]);
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/rooms");
    expect(url.searchParams.getAll("room")).toEqual([encodeLine(lineB), encodeLine(lineA)]);
    const parsed = parseCartParams({
      checkIn: url.searchParams.get("checkIn")!,
      checkOut: url.searchParams.get("checkOut")!,
      adults: url.searchParams.get("adults")!,
      children: url.searchParams.get("children")!,
      room: url.searchParams.getAll("room"),
    });
    expect(parsed).toEqual({
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      party: { adults: 5, children: 1 },
      promo: "",
      lines: [lineB, lineA],
      dropped: false,
    });
  });
  it("details link carries the cart in order plus the quoteHash shown", () => {
    const url = new URL(detailsHref(stay, [lineB, lineA], "h-123"), "http://x");
    expect(url.pathname).toBe("/book/details");
    expect(url.searchParams.getAll("room")).toEqual([encodeLine(lineB), encodeLine(lineA)]);
    expect(url.searchParams.get("quoteHash")).toBe("h-123");
  });
  it("carries a promo code, normalised, and drops an unreadable one", () => {
    const url = new URL(detailsHref({ ...stay, promo: " welcome10 " }, [lineA], "h"), "http://x");
    expect(url.searchParams.get("promo")).toBe("WELCOME10");
    expect(parseCartParams({ promo: "hills1000" }).promo).toBe("HILLS1000");
    expect(parseCartParams({ promo: "bad code!" }).promo).toBe("");
    expect(parseCartParams({ promo: "X".repeat(33) }).promo).toBe("");
    expect(
      new URL(stayHref({ ...stay, promo: "" }, [lineA]), "http://x").searchParams.has("promo"),
    ).toBe(false);
  });
  it("never writes or keeps more than 4 lines", () => {
    const five = Array(5).fill(lineA);
    expect(new URL(stayHref(stay, five), "http://x").searchParams.getAll("room")).toHaveLength(4);
    const parsed = parseCartParams({ room: five.map(encodeLine) });
    expect(parsed.lines).toHaveLength(4);
    expect(parsed.dropped).toBe(true);
  });
  it("drops malformed lines and reports it; a single room param works", () => {
    for (const bad of ["a.b.c", "a.b.0.0", "a.b.x.0", "a b.c.1.0", "a.b.1.0.9", "a.b.123.0"])
      expect(decodeLine(bad)).toBeNull();
    const parsed = parseCartParams({ room: encodeLine(lineA), checkIn: "nope", adults: "x" });
    expect(parsed.lines).toEqual([lineA]);
    expect(parsed.dropped).toBe(false);
    expect(parsed.checkIn).toBe("");
    expect(parsed.party).toEqual({ adults: 0, children: 0 });
    expect(parseCartParams({ room: ["junk", encodeLine(lineA)] })).toMatchObject({
      lines: [lineA],
      dropped: true,
    });
  });
});

describe("guestsLeft and demandByType", () => {
  it("counts down and goes negative when over-placed", () => {
    expect(guestsLeft({ adults: 5, children: 1 }, [lineA])).toEqual({ adults: 3, children: 0 });
    expect(guestsLeft({ adults: 2, children: 0 }, [lineA])).toEqual({ adults: 0, children: -1 });
  });
  it("counts lines per type", () => {
    expect([...demandByType([lineA, lineB, lineA])]).toEqual([
      ["rt-a", 2],
      ["rt-b", 1],
    ]);
  });
});
