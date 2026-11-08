import { describe, expect, it } from "vitest";
import { bookingFixture } from "@/modules/booking/fixtures";
import { quoteFixture } from "@/modules/pricing";
import {
  encodeNotice,
  holdStep,
  noticeMessage,
  parseNotice,
  reusableHold,
  type RoomsNotice,
} from "./hold-flow";

const stay = { checkIn: "2026-12-01", checkOut: "2026-12-03", adults: 2, children: 0 };
const lines = [{ roomTypeId: "rt-a", ratePlanId: "rp-a", adults: 2, children: 0 }];
const params = (href: string) => new URL(href, "http://x").searchParams;

describe("notices", () => {
  it("round-trip every kind", () => {
    const all: RoomsNotice[] = [
      { kind: "sold-out" },
      { kind: "sold-out", roomTypeId: "rt-a" },
      { kind: "blackout" },
      { kind: "line", lineIndex: 2, code: "NO_RATE" },
      { kind: "line", lineIndex: 0, code: "OVER_OCCUPANCY" },
    ];
    for (const n of all) {
      expect(parseNotice(encodeNotice(n))).toEqual(n);
      expect(noticeMessage(n)).toMatch(/\w/);
    }
  });
  it("ignores anything else", () => {
    for (const bad of [undefined, "", "line.9.NO_RATE", "line.1.X", "sold-out.<b>", "hello"])
      expect(parseNotice(bad)).toBeNull();
  });
});

describe("holdStep", () => {
  it("a hold goes to its pay page", () => {
    expect(holdStep({ ok: true, booking: bookingFixture }, stay, lines)).toEqual({
      kind: "pay",
      ref: bookingFixture.ref,
    });
  });
  it("price changed keeps the guest here with the new total and hash", () => {
    expect(
      holdStep({ ok: false, code: "PRICE_CHANGED", quote: quoteFixture }, stay, lines),
    ).toEqual({
      kind: "price-changed",
      totalPaise: quoteFixture.totalPaise,
      gstPaise: quoteFixture.gstPaise,
      quoteHash: quoteFixture.quoteHash,
    });
  });
  it("sold out and blackout go back to /rooms with the cart and a notice", () => {
    const sold = holdStep({ ok: false, code: "SOLD_OUT", roomTypeId: "rt-a" }, stay, lines);
    expect(sold.kind).toBe("rooms");
    const p = params((sold as { href: string }).href);
    expect(p.get("notice")).toBe("sold-out.rt-a");
    expect(p.getAll("room")).toHaveLength(1);
    expect(p.get("checkIn")).toBe(stay.checkIn);
    const black = holdStep({ ok: false, code: "BLACKOUT" }, stay, lines);
    expect(params((black as { href: string }).href).get("notice")).toBe("blackout");
  });
  it("line errors name the line; a refused promo goes back with the code kept", () => {
    const r = holdStep({ ok: false, code: "OVER_OCCUPANCY", lineIndex: 0 }, stay, lines);
    expect(params((r as { href: string }).href).get("notice")).toBe("line.0.OVER_OCCUPANCY");
    const promo = holdStep({ ok: false, code: "PROMO_INVALID" }, { ...stay, promo: "X1" }, lines);
    const pp = params((promo as { href: string }).href);
    expect(pp.get("promo")).toBe("X1");
    expect(pp.has("notice")).toBe(false);
  });
  it("window and invalid input stay on the page", () => {
    expect(holdStep({ ok: false, code: "OUTSIDE_WINDOW", message: "m" }, stay, lines)).toEqual({
      kind: "window",
      message: "m",
    });
    expect(holdStep({ ok: false, code: "INVALID_INPUT" }, stay, lines)).toEqual({
      kind: "error",
    });
  });
});

describe("reusableHold", () => {
  const now = Date.parse("2026-11-08T12:00:00Z");
  const held = {
    ...bookingFixture,
    status: "HELD" as const,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    quoteHash: "h1",
    holdExpiresAt: "2026-11-08T12:05:00Z",
  };
  const want = { checkIn: stay.checkIn, checkOut: stay.checkOut, quoteHash: "h1" };
  it("finds an unexpired hold for the same priced stay", () => {
    expect(reusableHold([held], want, now)?.id).toBe(held.id);
  });
  it("ignores expired, other hashes, other dates and other states", () => {
    expect(reusableHold([{ ...held, holdExpiresAt: "2026-11-08T12:00:00Z" }], want, now)).toBe(
      null,
    );
    expect(reusableHold([{ ...held, quoteHash: "h2" }], want, now)).toBeNull();
    expect(reusableHold([{ ...held, checkOut: "2026-12-04" }], want, now)).toBeNull();
    expect(reusableHold([{ ...held, status: "CONFIRMED", holdExpiresAt: null }], want, now)).toBe(
      null,
    );
  });
});
