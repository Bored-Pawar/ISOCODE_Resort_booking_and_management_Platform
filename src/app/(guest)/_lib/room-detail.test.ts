import { describe, expect, it } from "vitest";
import { roomTypesFixture } from "@/modules/catalog/fixtures";
import { quoteFixture } from "@/modules/pricing";
import {
  availabilityNote,
  bookHref,
  defaultPlanId,
  formatBp,
  gstBreakdown,
  toPlanView,
} from "./room-detail";

const night = (date: string, gstBp: number, gstPaise: number) => ({
  date,
  ratePaise: 1000,
  discountPaise: 0,
  gstBp,
  gstPaise,
});

describe("gstBreakdown", () => {
  it("groups nights by rate and sorts lowest first", () => {
    const lines = gstBreakdown([
      night("2026-11-20", 1800, 180),
      night("2026-11-21", 500, 50),
      night("2026-11-22", 1800, 181),
    ]);
    expect(lines).toEqual([
      { bp: 500, paise: 50, nights: 1 },
      { bp: 1800, paise: 361, nights: 2 },
    ]);
  });

  it("sums to the quote's GST", () => {
    const lines = gstBreakdown(quoteFixture.nights);
    expect(lines.reduce((s, l) => s + l.paise, 0)).toBe(quoteFixture.gstPaise);
    expect(lines.reduce((s, l) => s + l.nights, 0)).toBe(quoteFixture.nights.length);
  });
});

describe("formatBp", () => {
  it("formats whole and fractional percentages", () => {
    expect(formatBp(500)).toBe("5%");
    expect(formatBp(1800)).toBe("18%");
    expect(formatBp(1250)).toBe("12.5%");
  });
});

describe("toPlanView and bookHref", () => {
  const plan = roomTypesFixture[0].ratePlans[1];
  const view = toPlanView(plan, quoteFixture);

  it("keeps the quote's money untouched, in paise", () => {
    expect(view.totalPaise).toBe(quoteFixture.totalPaise);
    expect(view.gstPaise).toBe(quoteFixture.gstPaise);
    expect(view.nights).toHaveLength(quoteFixture.nights.length);
    expect(view.code).toBe("CP");
  });

  it("builds a booking link with ids, stay and the quote hash", () => {
    const href = bookHref(
      { roomTypeId: "r1", checkIn: "2026-11-20", checkOut: "2026-11-22", adults: 2, children: 1 },
      view,
    );
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/book");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      roomTypeId: "r1",
      ratePlanId: plan.id,
      checkIn: "2026-11-20",
      checkOut: "2026-11-22",
      adults: "2",
      children: "1",
      quoteHash: quoteFixture.quoteHash,
    });
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
