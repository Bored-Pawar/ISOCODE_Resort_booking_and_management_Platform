import { describe, expect, it, vi } from "vitest";

const selectQuote = vi.hoisted(() => vi.fn());
const preferredRoomStatus = vi.hoisted(() => vi.fn());
const namedRoomTypes = vi.hoisted(() => vi.fn());
vi.mock("./quote-selection", () => ({ selectQuote, preferredRoomStatus, namedRoomTypes }));
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

describe("room facts in a staff re-quote (production QA-01, QA-02)", () => {
  const facts = {
    dates: { from: "2026-11-20", to: "2026-11-22" },
    guests: { adults: 3, children: 0 },
  };
  it("the guest's own room is part of the evidence, so a cheaper unrelated room is never chosen", async () => {
    selectQuote.mockResolvedValueOnce(quote);
    await draftForStaff({
      ...base,
      staffFacts: { ...facts, room: "Garden Villa", roomSource: "message" },
      callModel: false,
    });
    expect(selectQuote.mock.calls.at(-1)![1]).toContain("Garden Villa");
  });
  it("preferred room unavailable: the draft says so and quotes nothing", async () => {
    selectQuote.mockResolvedValueOnce(null);
    preferredRoomStatus.mockResolvedValueOnce({ names: ["Garden Villa"], available: false });
    const d = await draftForStaff({
      ...base,
      staffFacts: { ...facts, room: "Garden Villa", roomSource: "message" },
      callModel: false,
    });
    expect(d.quote).toBeNull();
    expect(d.body).not.toMatch(/₹/);
    expect(d.body).toContain("Garden Villa is not available for 2026-11-20 to 2026-11-22");
  });
  it("room cleared by staff: no quote, the draft asks which room", async () => {
    selectQuote.mockClear();
    classifyMessage.mockClear();
    const d = await draftForStaff({
      ...base,
      staffFacts: { ...facts, room: null, roomSource: "cleared" },
      callModel: true,
    });
    expect(selectQuote).not.toHaveBeenCalled();
    expect(classifyMessage).not.toHaveBeenCalled();
    expect(d.body).toContain("Which room type would you prefer?");
    expect(d.quote).toBeNull();
  });
  it("a staff room matching no catalog type asks instead of quoting any room", async () => {
    selectQuote.mockClear();
    namedRoomTypes.mockResolvedValueOnce(null);
    const d = await draftForStaff({
      ...base,
      staffFacts: { ...facts, room: "Treehouse", roomSource: "staff" },
      callModel: false,
    });
    expect(selectQuote).not.toHaveBeenCalled();
    expect(d.body).toContain("Please confirm the room type");
    expect(d.body).not.toContain("Treehouse");
  });
  it("a staff room replacement skips model prose that would name the guest's room", async () => {
    classifyMessage.mockClear();
    namedRoomTypes.mockResolvedValueOnce(["Pool Villa"]);
    selectQuote.mockResolvedValueOnce(quote);
    const d = await draftForStaff({
      ...base,
      staffFacts: { ...facts, room: "Pool Villa", roomSource: "staff" },
      callModel: true,
    });
    expect(classifyMessage).not.toHaveBeenCalled();
    expect(d.provider).toBe("staff");
    expect(d.body).toContain("Pool Villa: From ₹24,800");
  });
  it("a pricing failure propagates so the rebuild is marked failed, not silently unpriced", async () => {
    selectQuote.mockRejectedValueOnce(new Error("db down"));
    await expect(
      draftForStaff({ ...base, staffFacts: { ...facts, roomSource: "message" }, callModel: false }),
    ).rejects.toThrow("db down");
  });
});
