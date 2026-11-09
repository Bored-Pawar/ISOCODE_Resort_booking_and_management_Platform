import { beforeEach, describe, expect, it, vi } from "vitest";

const selectQuote = vi.hoisted(() => vi.fn());
const preferredRoomStatus = vi.hoisted(() => vi.fn());
const namedRoomTypes = vi.hoisted(() => vi.fn());
vi.mock("@/modules/ai-router/quote-selection", () => ({
  selectQuote,
  preferredRoomStatus,
  namedRoomTypes,
}));
vi.mock("@/lib/dates", async (original) => ({
  ...(await original<typeof import("@/lib/dates")>()),
  todayIST: () => "2026-11-09",
}));

import { classificationFixtures } from "@/modules/ai-router/fixtures";
import { preferenceLabel } from "@/modules/ai-router/room-preference";
import { draftForStaff } from "@/modules/ai-router/staff-draft";
import {
  builtOnFacts,
  canonicalJson,
  factsFingerprint,
  quoteFactsOf,
  quoteKey,
  quoteStateOf,
  roomTextOf,
} from "./facts";
import { applyFieldEdit, fieldsInputSchema } from "./routing";

type X = Record<string, unknown>;
const grounded = { dates: "ok", guests: "ok", room: "ok" };

/** What `commitDraft` records once a rebuild under `gen` lands. */
function committed(x: X, gen: string, draft: { id: string; quote: unknown }): X {
  const facts = quoteFactsOf(x);
  return {
    ...x,
    quoteBasis: {
      state: "ready",
      gen,
      fp: factsFingerprint(facts),
      facts,
      draftId: draft.id,
      quoteKey: quoteKey(draft.quote),
      at: "2026-11-09T00:00:00.000Z",
    },
  };
}

function quote(from: string, to: string, adults: number, children: number, totalPaise: number) {
  return {
    checkIn: from,
    checkOut: to,
    lines: [{ roomTypeId: "rt", ratePlanId: "rp", adults, children }],
    totalPaise,
    gstPaise: Math.round(totalPaise * 0.18),
  };
}

beforeEach(() => {
  selectQuote.mockReset();
  preferredRoomStatus.mockReset();
  namedRoomTypes.mockReset();
});

describe("room has three states in the quote facts (QA-01)", () => {
  it("absent: staff never touched the room, the guest's message decides", () => {
    const f = quoteFactsOf({
      staffEdited: ["dates"],
      dates: { from: "2026-12-15", to: "2026-12-16" },
    });
    expect(f.room).toEqual({ source: "message" });
    expect(roomTextOf(f.room, "Garden Villa")).toBe("Garden Villa");
  });
  it("replaced: staff's room wins over the message", () => {
    const f = quoteFactsOf({ staffEdited: ["room"], room: "Pool Villa" });
    expect(f.room).toEqual({ source: "staff", name: "Pool Villa" });
    expect(roomTextOf(f.room, "Garden Villa")).toBe("Pool Villa");
  });
  it("cleared: edited with no value means no room, unlike absent", () => {
    const cleared = quoteFactsOf({ staffEdited: ["room"] });
    expect(cleared.room).toEqual({ source: "cleared" });
    expect(roomTextOf(cleared.room, "Garden Villa")).toBeNull();
    expect(factsFingerprint(cleared)).not.toBe(
      factsFingerprint(quoteFactsOf({ staffEdited: ["budget"] })),
    );
  });
  it("a room-only edit carries the grounded dates and party, so the quote survives", () => {
    const f = quoteFactsOf({
      dates: { from: "2026-12-15", to: "2026-12-17" },
      guests: { adults: 3, children: 1 },
      grounding: grounded,
      staffEdited: ["room"],
      room: "Pool Villa",
    });
    expect(f).toMatchObject({
      staff: true,
      dates: { from: "2026-12-15", to: "2026-12-17" },
      guests: { adults: 3, children: 1 },
    });
  });
});

describe("approval state from the saved facts (QA-02)", () => {
  const draft = { id: "d1", quote: { totalPaise: 100 } };
  it("an intake draft is current only while no quote-affecting field was edited", () => {
    expect(quoteStateOf({ grounding: grounded }, draft)).toBe("current");
    expect(quoteStateOf({ staffEdited: ["budget", "language"] }, draft)).toBe("current");
    // Rebuilt by older code (no basis recorded) after a room edit: never approvable as is.
    expect(quoteStateOf({ staffEdited: ["room"], room: "Pool Villa" }, draft)).toBe("stale");
  });
  it("rebuilding and failed refuse; ready must match facts, draft and quote", () => {
    const x = committed(
      { staffEdited: ["dates"], dates: { from: "2026-12-15", to: "2026-12-16" } },
      "g",
      draft,
    );
    expect(quoteStateOf(x, draft)).toBe("current");
    const basis = x.quoteBasis as X;
    expect(quoteStateOf({ ...x, quoteBasis: { ...basis, state: "rebuilding" } }, draft)).toBe(
      "rebuilding",
    );
    expect(quoteStateOf({ ...x, quoteBasis: { ...basis, state: "failed" } }, draft)).toBe("failed");
    expect(quoteStateOf(x, { ...draft, id: "d2" })).toBe("stale");
    expect(quoteStateOf(x, { ...draft, quote: { totalPaise: 999 } })).toBe("stale");
    expect(quoteStateOf({ ...x, dates: { from: "2026-12-15", to: "2026-12-18" } }, draft)).toBe(
      "stale",
    );
  });
  it("quote keys ignore JSONB key order", () => {
    expect(quoteKey({ a: 1, b: { c: 2, d: [1, { e: 3, f: 4 }] } })).toBe(
      quoteKey({ b: { d: [1, { f: 4, e: 3 }], c: 2 }, a: 1 }),
    );
    expect(canonicalJson({ b: 1, a: undefined })).toBe('{"b":1}');
  });
  it("built-on facts: the recorded basis, or the message's grounded facts for an intake draft", () => {
    const intake = {
      dates: { from: "2026-12-14", to: "2026-12-16" },
      guests: { adults: 2, children: 1 },
      grounding: grounded,
    };
    expect(builtOnFacts(intake, "current")).toMatchObject({
      dates: { from: "2026-12-14", to: "2026-12-16" },
      guests: { adults: 2, children: 1 },
      room: { source: "message" },
    });
    expect(builtOnFacts({ staffEdited: ["room"] }, "stale")).toBeNull();
  });
});

describe("ENQ-YRTH2 sequence from the production fix queue", () => {
  const raw = "Is a Garden Villa free 14-16 Dec 2026 for 2 adults and 1 child?";
  const label = preferenceLabel(raw);
  const villa = classificationFixtures["ENQ-4411"].classification;
  const base = {
    rawText: raw,
    senderName: "Synthetic Guest",
    senderContact: "+919000000001",
    receivedAt: new Date("2026-11-09T05:00:00Z"),
    classification: { ...villa, category: "room" as const },
    callModel: false,
  };
  /** The form as staff see it: every field prefilled, Room showing the room the quote uses. */
  const form = (x: X, over: X) => {
    const e = x as {
      dates: { from: string; to: string };
      guests: { adults: number; children: number };
    };
    return fieldsInputSchema.parse({
      enquiryId: "ENQ-YRTH2",
      dates: { from: e.dates.from, to: e.dates.to },
      guests: { adults: e.guests.adults, children: e.guests.children },
      budgetInr: null,
      room: roomTextOf(quoteFactsOf(x).room, label),
      language: "en",
      ...over,
    });
  };
  /** What `redraft` hands to the draft step for these saved facts. */
  const rebuildFrom = (x: X) => {
    const f = quoteFactsOf(x);
    return draftForStaff({
      ...base,
      staffFacts: {
        dates: f.dates,
        guests: f.guests,
        room: roomTextOf(f.room, label),
        roomSource: f.room.source,
      },
    });
  };

  it("keeps Garden Villa on date and party edits, and a room-only edit makes the Garden quote unapprovable", async () => {
    expect(label).toBe("Garden Villa");
    let x: X = {
      dates: { from: "2026-12-14", to: "2026-12-16" },
      guests: { adults: 2, children: 1, total: 3 },
      budget: {},
      language: "en",
      grounding: grounded,
    };
    const intake = { id: "d1", quote: quote("2026-12-14", "2026-12-16", 2, 1, 3_835_000) };
    expect(quoteStateOf(x, intake)).toBe("current");

    // 1. Change only check-in to 15 Dec: the old draft is refused at once, the villa is kept.
    const e1 = applyFieldEdit(
      x,
      form(x, { dates: { from: "2026-12-15", to: "2026-12-16" } }),
      label,
      "g1",
    );
    expect(e1).toMatchObject({ changed: ["dates"], requote: true });
    expect(quoteStateOf(e1.next, intake)).toBe("rebuilding");
    expect(quoteFactsOf(e1.next).room).toEqual({ source: "message" });
    selectQuote.mockResolvedValueOnce(quote("2026-12-15", "2026-12-16", 2, 1, 1_917_500));
    const d1 = await rebuildFrom(e1.next);
    expect(selectQuote.mock.calls[0][1]).toContain("Garden Villa");
    expect(selectQuote.mock.calls[0][1]).not.toMatch(/Plantation/);
    expect(d1.body).toContain("₹19,175");
    x = committed(e1.next, "g1", { id: "d1", quote: d1.quote });
    expect(quoteStateOf(x, { id: "d1", quote: d1.quote })).toBe("current");

    // 2. 15 to 17 Dec, 3 adults: the Room box still shows Garden Villa, so it stays the guest's.
    const e2 = applyFieldEdit(
      x,
      form(x, {
        dates: { from: "2026-12-15", to: "2026-12-17" },
        guests: { adults: 3, children: 1 },
      }),
      label,
      "g2",
    );
    expect(e2.changed).toEqual(["dates", "guests"]);
    selectQuote.mockResolvedValueOnce(quote("2026-12-15", "2026-12-17", 3, 1, 3_835_000));
    const d2 = await rebuildFrom(e2.next);
    expect(selectQuote.mock.calls[1][1]).toContain("Garden Villa");
    const garden = { id: "d1", quote: d2.quote };
    x = committed(e2.next, "g2", garden);
    expect(quoteStateOf(x, garden)).toBe("current");

    // 3. Change only Room to Pool Villa: re-priced, never the Garden Villa ₹38,350.
    const e3 = applyFieldEdit(x, form(x, { room: "Pool Villa" }), label, "g3");
    expect(e3).toMatchObject({ changed: ["room"], requote: true });
    expect(quoteStateOf(e3.next, garden)).toBe("rebuilding");
    // Even without the in-flight marker (the old code path), the saved facts no longer match.
    expect(quoteStateOf({ ...e3.next, quoteBasis: x.quoteBasis }, garden)).toBe("stale");
    namedRoomTypes.mockResolvedValueOnce(["Pool Villa"]);
    selectQuote.mockResolvedValueOnce(quote("2026-12-15", "2026-12-17", 3, 1, 6_490_000));
    const d3 = await rebuildFrom(e3.next);
    expect(selectQuote.mock.calls[2][1]).toContain("Pool Villa");
    expect(selectQuote.mock.calls[2][1]).not.toContain("Garden");
    expect(d3.body).toContain("₹64,900");
    expect(d3.body).not.toContain("₹38,350");
    x = committed(e3.next, "g3", { id: "d1", quote: d3.quote });
    expect(quoteStateOf(x, { id: "d1", quote: d3.quote })).toBe("current");
    expect(quoteStateOf(x, garden)).toBe("stale");
  });

  it("emptying the Room box is an explicit clear: the draft asks and quotes nothing", async () => {
    const x: X = {
      dates: { from: "2026-12-14", to: "2026-12-16" },
      guests: { adults: 2, children: 1, total: 3 },
      language: "en",
      grounding: grounded,
    };
    const e = applyFieldEdit(x, form(x, { room: null }), label, "g");
    expect(e).toMatchObject({ changed: ["room"], requote: true });
    expect(quoteFactsOf(e.next).room).toEqual({ source: "cleared" });
    const d = await rebuildFrom(e.next);
    expect(selectQuote).not.toHaveBeenCalled();
    expect(d.quote).toBeNull();
    expect(d.body).not.toMatch(/₹/);
    expect(d.body).toContain("Which room type would you prefer?");
  });

  it("saving the form untouched changes nothing and keeps the old draft current", () => {
    const x: X = {
      dates: { from: "2026-12-14", to: "2026-12-16" },
      guests: { adults: 2, children: 1, total: 3 },
      language: "en",
      grounding: grounded,
    };
    const e = applyFieldEdit(x, form(x, {}), label, "g");
    expect(e).toMatchObject({ changed: [], requote: false });
    expect(e.next).toBe(x);
  });
});
