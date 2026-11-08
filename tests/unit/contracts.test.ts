import { describe, expect, it } from "vitest";
import {
  pricing,
  quoteFixture,
  computeQuoteHash,
  changedQuoteFixture,
  twoRoomQuoteFixture,
  quoteInputSchema,
} from "@/modules/pricing";
import { inventory } from "@/modules/inventory";
import { booking, acquireHoldInputSchema } from "@/modules/booking";
import { bookingFixture, twoRoomBookingFixture } from "@/modules/booking/fixtures";
import { enquiries } from "@/modules/enquiries";
import { enquiriesFixture } from "@/modules/enquiries/fixtures";
import { aiRouter, classificationSchema } from "@/modules/ai-router";
import { classificationFixtures } from "@/modules/ai-router/fixtures";
import { roomTypesFixture } from "@/modules/catalog/fixtures";

const line = { roomTypeId: "rt-plantation-room", ratePlanId: "rp-plantation-cp", adults: 2 };
const stay = { checkIn: "2026-11-14", checkOut: "2026-11-16", rooms: [line] };
const guest = { userId: "user-guest-asha", role: "guest" as const };

describe("fixtures are internally consistent", () => {
  it("quote totals add up in integer paise: cells -> lines -> order (1-line and 2-line)", () => {
    for (const q of [quoteFixture, changedQuoteFixture, twoRoomQuoteFixture]) {
      const cells = q.lines.flatMap((l) => l.nights);
      expect(cells.reduce((s, n) => s + n.ratePaise, 0)).toBe(q.subtotalPaise);
      expect(cells.reduce((s, n) => s + n.gstPaise, 0)).toBe(q.gstPaise);
      expect(q.lines.reduce((s, l) => s + l.totalPaise, 0)).toBe(q.totalPaise);
      expect(q.totalPaise).toBe(q.subtotalPaise - q.discountPaise + q.gstPaise);
      expect(q.lines.map((l) => l.lineNo)).toEqual(q.lines.map((_, i) => i + 1));
      expect(computeQuoteHash(q)).toBe(q.quoteHash);
    }
    expect(quoteFixture.quoteHash).not.toBe(changedQuoteFixture.quoteHash);
    expect(twoRoomQuoteFixture.lines).toHaveLength(2);
    expect(twoRoomQuoteFixture.lines[0]).toEqual(quoteFixture.lines[0]);
  });
  it("booking fixtures mirror their quotes, one total per order", () => {
    for (const [b, q] of [
      [bookingFixture, quoteFixture],
      [twoRoomBookingFixture, twoRoomQuoteFixture],
    ] as const) {
      expect(b.totalPaise).toBe(q.totalPaise);
      expect(b.quoteHash).toBe(q.quoteHash);
      expect(b.rooms.map((r) => [r.lineNo, r.roomTypeId, r.totalPaise])).toEqual(
        q.lines.map((l) => [l.lineNo, l.roomTypeId, l.totalPaise]),
      );
    }
  });
  it("B10 schemas: 1 to 4 rooms, each line needs an adult", () => {
    expect(quoteInputSchema.safeParse(stay).success).toBe(true);
    expect(quoteInputSchema.safeParse({ ...stay, rooms: Array(4).fill(line) }).success).toBe(true);
    expect(quoteInputSchema.safeParse({ ...stay, rooms: Array(5).fill(line) }).success).toBe(false);
    expect(quoteInputSchema.safeParse({ ...stay, rooms: [] }).success).toBe(false);
    expect(quoteInputSchema.safeParse({ ...stay, rooms: [{ ...line, adults: 0 }] }).success).toBe(
      false,
    );
    expect(acquireHoldInputSchema.safeParse({ stay, quoteHash: "h", guestId: "g" }).success).toBe(
      true,
    );
    expect(
      acquireHoldInputSchema.safeParse({
        stay: { ...stay, rooms: Array(5).fill(line) },
        quoteHash: "h",
        guestId: "g",
      }).success,
    ).toBe(false);
  });
  it("catalog fixtures carry max occupancy at or above max adults", () => {
    expect(roomTypesFixture.map((r) => r.maxOccupancy)).toEqual([3, 4, 5, 6]);
    expect(roomTypesFixture.every((r) => r.maxOccupancy >= r.maxAdults)).toBe(true);
  });
  it("classification fixtures satisfy the schema", async () => {
    for (const id of ["ENQ-4410", "ENQ-4411", "ENQ-4412", "ENQ-COMPLAINT", "ENQ-UNSURE"]) {
      expect(
        classificationSchema.safeParse(classificationFixtures[id].classification).success,
      ).toBe(true);
    }
  });
  it("catalog fixtures match assumption A9 (76 keys); the DB catalog is checked by seed.test", () => {
    expect(roomTypesFixture.reduce((s, r) => s + r.totalUnits, 0)).toBe(76);
  });
});

describe("stubs return discriminated results, never throw", () => {
  it("pricing.quote", async () => {
    expect(await pricing.quote({ ...stay, checkOut: "2026-11-14" })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
  });
  it("inventory.availability", async () => {
    expect((await inventory.availability({ checkIn: "bad", checkOut: "x" })).ok).toBe(false);
  });
  it("booking.confirmPayment validates input before database work", async () => {
    expect(
      await booking.confirmPayment({
        bookingId: "bad",
        provider: "mock",
        providerPaymentId: "pay",
        amountPaise: 0,
      }),
    ).toEqual({ ok: false, code: "INVALID_INPUT" });
  });
  it("booking.get validates input and actor before database work", async () => {
    expect(await booking.get({ ref: "" }, guest)).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(await booking.get({ ref: "CA-X" }, { userId: "x", role: "invalid" } as never)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });
  it("enquiries.ingest rejects bad input before any database call; aiRouter.process", async () => {
    // Success paths write to PostgreSQL (Q1) and are covered by the integration suite.
    expect(
      (await enquiries.ingest({ channel: "web", senderName: "", senderContact: "", rawText: "" }))
        .ok,
    ).toBe(false);
    expect(await aiRouter.process({ enquiryId: "" })).toEqual({ ok: false, code: "INVALID_INPUT" });
  });
  it("the three brief enquiries are verbatim", async () => {
    const list = enquiriesFixture;
    expect(list.map((e) => e.id)).toEqual(["ENQ-4410", "ENQ-4411", "ENQ-4412"]);
    expect(list[1].rawText).toBe("Is a villa free 14-16 Nov for 2 adults and a child?");
  });
});
