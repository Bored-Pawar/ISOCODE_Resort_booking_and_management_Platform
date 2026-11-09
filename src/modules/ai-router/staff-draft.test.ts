import { describe, expect, it, vi } from "vitest";

const selectQuote = vi.hoisted(() => vi.fn());
vi.mock("./quote-selection", () => ({ selectQuote }));
const classifyMessage = vi.hoisted(() => vi.fn());
vi.mock("./classify", () => ({ classifyMessage }));

import { classificationFixtures } from "./fixtures";
import { groundExtraction } from "./grounding";
import { draftForStaff, factsText } from "./staff-draft";

const villa = classificationFixtures["ENQ-4411"].classification;
const today = "2026-11-09";
const base = {
  rawText: "Is a villa free 14-16 Nov for 2 adults and a child?",
  senderName: "Rohit Shetty",
  senderContact: "+919000000001",
  receivedAt: new Date("2026-11-09T05:00:00Z"),
  classification: villa,
};
const quote = {
  checkIn: "2026-11-20",
  checkOut: "2026-11-22",
  lines: [{ roomTypeId: "r1", ratePlanId: "p1", adults: 3, children: 0 }],
  totalPaise: 2_480_000,
  gstPaise: 265_714,
  roomNames: ["Pool Villa"],
};

describe("staff facts are grounded like a guest message", () => {
  it("dates and party typed by staff become ok evidence", () => {
    const facts = {
      dates: { from: "2026-11-20", to: "2026-11-22" },
      guests: { adults: 3, children: 0 },
    };
    const c = { ...villa, dates: facts.dates, guests: { adults: 3, children: 0, total: 3 } };
    const g = groundExtraction(factsText(facts), c, today);
    expect(g.eligible).toBe(true);
    expect(g.guests).toEqual({ adults: 3, children: 0 });
  });
  it("children are carried when given", () => {
    const facts = {
      dates: { from: "2026-11-20", to: "2026-11-22" },
      guests: { adults: 2, children: 1 },
    };
    const c = { ...villa, dates: facts.dates, guests: { adults: 2, children: 1, total: 3 } };
    expect(groundExtraction(factsText(facts), c, today).eligible).toBe(true);
  });
});

describe("draftForStaff", () => {
  it("a field edit re-quotes from the staff facts and never calls the model", async () => {
    selectQuote.mockResolvedValueOnce(quote);
    const d = await draftForStaff({
      ...base,
      staffFacts: {
        dates: { from: "2026-11-20", to: "2026-11-22" },
        guests: { adults: 3, children: 0 },
      },
      callModel: false,
    });
    expect(classifyMessage).not.toHaveBeenCalled();
    expect(selectQuote.mock.calls[0][0]).toMatchObject({ dates: { from: "2026-11-20" } });
    expect(d.body).toContain("Quoted for 2026-11-20 to 2026-11-22");
    expect(d.body).toContain("₹24,800");
    expect(d.provider).toBe("staff");
    expect(d.quote).not.toHaveProperty("roomNames");
  });
  it("without a quote there is no price, only the clarification line", async () => {
    selectQuote.mockResolvedValueOnce(null);
    const d = await draftForStaff({ ...base, callModel: false });
    expect(d.body).not.toMatch(/₹/);
    expect(d.quote).toBeNull();
  });
  it("regenerate keeps the stored classification and drops unsafe model prose", async () => {
    selectQuote.mockResolvedValueOnce(null);
    classifyMessage.mockResolvedValueOnce({
      status: "ok",
      classification: { ...villa, category: "complaint" },
      draftText: "Great news, the villa is confirmed at ₹5,000!",
      response: { provider: "local", model: "m" },
    });
    const d = await draftForStaff({ ...base, callModel: true });
    expect(d.body).not.toContain("₹5,000");
    expect(d.usedTemplate).toBe(true);
    expect(d.provider).toBe("local");
    expect(d.body).toContain("reservations team");
  });
});
