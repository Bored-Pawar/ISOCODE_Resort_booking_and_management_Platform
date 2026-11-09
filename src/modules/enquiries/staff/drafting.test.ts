import { describe, expect, it } from "vitest";
import { quoteFactsOf } from "./facts";

// Moved from drafting.staffFactsOf to facts.quoteFactsOf (production QA-01); cases unchanged.
const staffFactsOf = (row: { extracted: unknown }) => quoteFactsOf(row.extracted);
const row = (extracted: Record<string, unknown>) => ({ extracted });
const dates = { from: "2026-11-14", to: "2026-11-16" };
const guests = { adults: 2, children: 1, total: 3 };

describe("staff facts for a re-quote (review MAJOR 1)", () => {
  it("guests only edited: the AI dates, grounded ok, are carried so the quote survives", () => {
    const f = staffFactsOf(
      row({
        dates,
        guests: { adults: 3, children: 0 },
        staffEdited: ["guests"],
        grounding: { dates: "ok", guests: "ok" },
      }),
    );
    expect(f.dates).toEqual(dates);
    expect(f.guests).toEqual({ adults: 3, children: 0 });
  });
  it("dates only edited: the AI party, grounded ok, is carried", () => {
    const f = staffFactsOf(
      row({
        dates: { from: "2026-11-20", to: "2026-11-22" },
        guests,
        staffEdited: ["dates"],
        grounding: { dates: "ok", guests: "ok" },
      }),
    );
    expect(f.dates).toEqual({ from: "2026-11-20", to: "2026-11-22" });
    expect(f.guests).toEqual({ adults: 2, children: 1 });
  });
  it("an unsupported or missing field is never promoted to a fact", () => {
    const f = staffFactsOf(
      row({
        dates,
        guests,
        staffEdited: ["guests"],
        grounding: { dates: "unsupported", guests: "ok" },
      }),
    );
    expect(f.dates).toBeNull();
    expect(
      staffFactsOf(row({ dates, guests, staffEdited: ["dates"], grounding: { dates: "ok" } }))
        .guests,
    ).toBeNull();
  });
  it("no staff edit: no facts, the guest message stays the evidence", () => {
    const f = staffFactsOf(row({ dates, guests, grounding: { dates: "ok", guests: "ok" } }));
    expect(f.dates).toBeNull();
    expect(f.guests).toBeNull();
  });
});
