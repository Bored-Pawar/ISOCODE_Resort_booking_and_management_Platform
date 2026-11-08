import { describe, expect, it } from "vitest";
import { roomTypesFixture } from "@/modules/catalog/fixtures";
import { quoteFixture, twoRoomQuoteFixture } from "@/modules/pricing/fixtures";
import {
  availabilityView,
  defaultPlanId,
  EXPLORE_ROOMS,
  formatBp,
  gstBreakdown,
  nightsByDate,
  stayNav,
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
});

describe("defaultPlanId", () => {
  it("selects the cheapest plan by default", () => {
    const plan = roomTypesFixture[0].ratePlans[0];
    const a = { ...toPlanView(plan, quoteFixture), id: "a", totalPaise: 900 };
    const b = { ...a, id: "b", totalPaise: 500 };
    expect(defaultPlanId([a, b])).toBe("b");
    expect(defaultPlanId([])).toBeUndefined();
  });
});

describe("availabilityView", () => {
  it("is free above the low-stock line, warns at 3 or fewer, and none at 0", () => {
    expect(availabilityView(4)).toEqual({
      state: "free",
      label: "Available for your dates",
      tone: "success",
    });
    expect(availabilityView(3)).toEqual({ state: "low", label: "Only 3 left", tone: "warning" });
    expect(availabilityView(1).label).toBe("Only 1 left");
    expect(availabilityView(0)).toEqual({ state: "none", label: "Not available for these dates" });
    expect(availabilityView(-2).state).toBe("none");
  });
});

describe("stayNav", () => {
  const stay = { checkIn: "2026-11-20", checkOut: "2026-11-22", adults: 4, children: 0 };
  const line = { roomTypeId: "rt-a", ratePlanId: "rp-a", adults: 2, children: 0 };
  const saved = {
    checkIn: "2026-12-01",
    checkOut: "2026-12-03",
    party: { adults: 2, children: 1 },
    promo: "",
    lines: [line],
    dropped: false,
  };

  it("goes back to the URL cart unchanged", () => {
    const nav = stayNav({ hasCartParam: true, stay, lines: [line, line] }, saved);
    expect(nav.kind).toBe("back");
    expect(nav.label).toBe("Back to my stay");
    expect(nav.href).toBe(
      "/rooms?checkIn=2026-11-20&checkOut=2026-11-22&adults=4&children=0&room=rt-a.rp-a.2.0&room=rt-a.rp-a.2.0",
    );
  });

  it("an empty cart in the link wins over the saved one", () => {
    expect(stayNav({ hasCartParam: true, stay, lines: [] }, saved)).toEqual(EXPLORE_ROOMS);
  });

  it("without a cart in the link, returns to the saved stay with its own dates and group", () => {
    expect(stayNav({ hasCartParam: false, stay, lines: [] }, saved).href).toBe(
      "/rooms?checkIn=2026-12-01&checkOut=2026-12-03&adults=2&children=1&room=rt-a.rp-a.2.0",
    );
  });

  it("explores from home when there is no cart anywhere", () => {
    expect(stayNav({ hasCartParam: false, stay, lines: [] }, null)).toEqual({
      kind: "explore",
      href: "/#rooms",
      label: "Explore more rooms",
    });
    expect(stayNav({ hasCartParam: false, stay, lines: [] }, { ...saved, lines: [] }).kind).toBe(
      "explore",
    );
  });
});
