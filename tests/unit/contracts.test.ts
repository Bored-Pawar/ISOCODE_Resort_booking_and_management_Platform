import { describe, expect, it } from "vitest";
import { pricing, quoteFixture, computeQuoteHash, changedQuoteFixture } from "@/modules/pricing";
import { inventory } from "@/modules/inventory";
import { booking } from "@/modules/booking";
import { enquiries } from "@/modules/enquiries";
import { aiRouter, classificationSchema } from "@/modules/ai-router";
import { catalog } from "@/modules/catalog";

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
  it("catalog matches assumption A9 (76 keys)", async () => {
    const rooms = await catalog.listRoomTypes();
    expect(rooms.reduce((s, r) => s + r.totalUnits, 0)).toBe(76);
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
  it("booking.confirmPayment checks the amount", async () => {
    const base = { bookingId: "bk-0001", provider: "mock", providerPaymentId: "pay_1" };
    const bad = await booking.confirmPayment({ ...base, amountPaise: 100 });
    expect(bad).toEqual({ ok: false, code: "AMOUNT_MISMATCH" });
    const good = await booking.confirmPayment({ ...base, amountPaise: quoteFixture.totalPaise });
    expect(good.ok && good.outcome).toBe("CONFIRMED");
  });
  it("booking.get validates input and actor before database work", async () => {
    expect(await booking.get({ ref: "" }, guest)).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(await booking.get({ ref: "CA-X" }, { userId: "x", role: "invalid" } as never)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });
  it("enquiries.ingest and aiRouter.process", async () => {
    const r = await enquiries.ingest({
      channel: "web",
      senderName: "A",
      senderContact: "a@example.com",
      rawText: "Is a villa free?",
    });
    expect(r).toMatchObject({ ok: true, aiStatus: "pending" });
    expect(
      (await enquiries.ingest({ channel: "web", senderName: "", senderContact: "", rawText: "" }))
        .ok,
    ).toBe(false);
    expect(await aiRouter.process({ enquiryId: "nope" })).toEqual({ ok: false, code: "NOT_FOUND" });
  });
  it("the three brief enquiries are verbatim", async () => {
    const list = await enquiries.list();
    expect(list.map((e) => e.id)).toEqual(["ENQ-4410", "ENQ-4411", "ENQ-4412"]);
    expect(list[1].rawText).toBe("Is a villa free 14-16 Nov for 2 adults and a child?");
  });
});
