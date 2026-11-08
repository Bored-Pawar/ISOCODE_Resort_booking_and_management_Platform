import { describe, expect, it } from "vitest";
import { roomTypesFixture } from "@/modules/catalog/fixtures";
import { quoteFixture, twoRoomQuoteFixture } from "@/modules/pricing/fixtures";
import {
  availabilityNote,
  cartLines,
  defaultPlanId,
  formatBp,
  gstBreakdown,
  nightsByDate,
  toPlanView,
} from "./room-detail";

const cells = (q: typeof quoteFixture) => q.lines.flatMap((l) => l.nights);

describe("gstBreakdown", () => {
  it("groups GST by rate and keeps the total", () => {
    const lines = gstBreakdown(cells(quoteFixture));
    expect(lines.map((l) => l.bp)).toEqual([500, 1800]);
    expect(lines.reduce((s, l) => s + l.paise, 0)).toBe(quoteFixture.gstPaise);
    expect(lines.reduce((s, l) => s + l.nights, 0)).toBe(cells(quoteFixture).length);
  });
  it("counts room-nights over a 2-room cart", () => {
    const lines = gstBreakdown(cells(twoRoomQuoteFixture));
    expect(lines.reduce((s, l) => s + l.nights, 0)).toBe(4);
    expect(lines.reduce((s, l) => s + l.paise, 0)).toBe(twoRoomQuoteFixture.gstPaise);
  });
});

describe("formatBp", () => {
  it("formats whole and fractional percentages", () => {
    expect(formatBp(500)).toBe("5%");
    expect(formatBp(1800)).toBe("18%");
    expect(formatBp(1250)).toBe("12.5%");
  });
});

describe("toPlanView", () => {
  const plan = roomTypesFixture[0].ratePlans[1];

  it("keeps the quote's money untouched, in paise", () => {
    const view = toPlanView(plan, quoteFixture);
    expect(view.totalPaise).toBe(quoteFixture.totalPaise);
    expect(view.gstPaise).toBe(quoteFixture.gstPaise);
    expect(view.nights).toHaveLength(2);
    expect(view.code).toBe("CP");
    expect(view.lines).toEqual([
      { roomTypeId: "rt-plantation-room", ratePlanId: "rp-plantation-cp", adults: 2, children: 0 },
    ]);
  });

  it("sums a 2-room cart per date for display and keeps cart order", () => {
    const view = toPlanView(plan, twoRoomQuoteFixture);
    expect(view.totalPaise).toBe(twoRoomQuoteFixture.totalPaise);
    expect(view.lines.map((l) => l.roomTypeId)).toEqual(["rt-plantation-room", "rt-estate-suite"]);
    const byDate = nightsByDate(twoRoomQuoteFixture);
    expect(byDate.map((d) => d.date)).toEqual(["2026-11-14", "2026-11-15"]);
    expect(byDate.reduce((s, d) => s + d.ratePaise, 0)).toBe(twoRoomQuoteFixture.subtotalPaise);
    expect(byDate.reduce((s, d) => s + d.gstPaise, 0)).toBe(twoRoomQuoteFixture.gstPaise);
  });

  it("builds cart lines from a split", () => {
    expect(
      cartLines("r", "p", [
        { adults: 2, children: 0 },
        { adults: 1, children: 1 },
      ]),
    ).toEqual([
      { roomTypeId: "r", ratePlanId: "p", adults: 2, children: 0 },
      { roomTypeId: "r", ratePlanId: "p", adults: 1, children: 1 },
    ]);
  });
});

describe("availabilityNote and defaultPlanId", () => {
  it("warns only when 3 or fewer units are left", () => {
    expect(availabilityNote(1)).toEqual({ tone: "warning", text: "Only 1 left for these dates" });
    expect(availabilityNote(3).tone).toBe("warning");
    expect(availabilityNote(4)).toEqual({ tone: "success", text: "Available for your dates" });
  });

  it("selects the cheapest plan by default", () => {
    const plan = roomTypesFixture[0].ratePlans[0];
    const a = { ...toPlanView(plan, quoteFixture), id: "a", totalPaise: 900 };
    const b = { ...a, id: "b", totalPaise: 500 };
    expect(defaultPlanId([a, b])).toBe("b");
    expect(defaultPlanId([])).toBeUndefined();
  });
});
