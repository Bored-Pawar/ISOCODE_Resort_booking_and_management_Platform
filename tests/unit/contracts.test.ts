import { describe, expect, it } from "vitest";
import { pricing, quoteFixture, computeQuoteHash, changedQuoteFixture } from "@/modules/pricing";
import { inventory } from "@/modules/inventory";
import { booking } from "@/modules/booking";
import { enquiries } from "@/modules/enquiries";
import { enquiriesFixture } from "@/modules/enquiries/fixtures";
import { aiRouter, classificationSchema } from "@/modules/ai-router";
import { roomTypesFixture } from "@/modules/catalog/fixtures";

const stay = {
  roomTypeId: "rt-plantation-room",
  ratePlanId: "rp-plantation-cp",
  checkIn: "2026-11-14",
  checkOut: "2026-11-16",
  adults: 2,
};
const guest = { userId: "user-guest-asha", role: "guest" as const };

describe("fixtures are internally consistent", () => {
  it("quote totals add up in integer paise", () => {
    for (const q of [quoteFixture, changedQuoteFixture]) {
      const rates = q.nights.reduce((s, n) => s + n.ratePaise, 0);
      const gst = q.nights.reduce((s, n) => s + n.gstPaise, 0);
      expect(rates).toBe(q.subtotalPaise);
      expect(gst).toBe(q.gstPaise);
      expect(q.totalPaise).toBe(q.subtotalPaise - q.discountPaise + q.gstPaise);
      expect(computeQuoteHash(q)).toBe(q.quoteHash);
    }
    expect(quoteFixture.quoteHash).not.toBe(changedQuoteFixture.quoteHash);
  });
  it("classification fixtures satisfy the schema", async () => {
    for (const id of ["ENQ-4410", "ENQ-4411", "ENQ-4412", "ENQ-COMPLAINT", "ENQ-UNSURE"]) {
      const r = await aiRouter.process({ enquiryId: id });
      expect(r.ok).toBe(true);
      if (r.ok) expect(classificationSchema.safeParse(r.classification).success).toBe(true);
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
    expect(await aiRouter.process({ enquiryId: "nope" })).toEqual({ ok: false, code: "NOT_FOUND" });
  });
  it("the three brief enquiries are verbatim", async () => {
    const list = enquiriesFixture;
    expect(list.map((e) => e.id)).toEqual(["ENQ-4410", "ENQ-4411", "ENQ-4412"]);
    expect(list[1].rawText).toBe("Is a villa free 14-16 Nov for 2 adults and a child?");
  });
});
