import { describe, expect, it } from "vitest";
import {
  cellKey,
  emptyOverlay,
  overlayReducer as reduce,
  shownPrice,
  type BulkScope,
  type OverlayState,
} from "./rate-overlay";

// 2026-12-04 is a Friday.
const KEY = cellKey("villa", "ep", "2026-12-04");
const bulk: BulkScope = {
  roomTypeIds: ["villa"],
  planCodes: ["EP"],
  from: "2026-12-01",
  to: "2026-12-31",
  days: [5, 6],
};
const server = (prices: Record<string, number>) => (k: string) => prices[k];

function inlineSave(s: OverlayState, value: number, version: number) {
  s = reduce(s, { type: "saved", key: KEY, planCode: "EP", value, version });
  return reduce(s, { type: "refreshRequested", version });
}
function bulkSave(s: OverlayState, scope: BulkScope, version: number) {
  s = reduce(s, { type: "bulkSaved", scope, version });
  return reduce(s, { type: "refreshRequested", version });
}

describe("rates grid overlay (audit M01)", () => {
  it("inline 12,500 then bulk 20,000 over the cell: refreshed rows show and edit 20,000", () => {
    let s = inlineSave(emptyOverlay, 1_250_000, 1);
    expect(shownPrice(s, KEY, 1_000_000)).toBe(1_250_000); // optimistic, before the refresh lands
    s = reduce(s, { type: "rowsArrived", server: server({ [KEY]: 1_250_000 }) });
    expect(s.overrides).toEqual({});
    s = bulkSave(s, bulk, 2);
    s = reduce(s, { type: "rowsArrived", server: server({ [KEY]: 2_000_000 }) });
    expect(shownPrice(s, KEY, 2_000_000)).toBe(2_000_000);
  });

  it("the audit's sequence without a refresh in between still shows the bulk price", () => {
    let s = inlineSave(emptyOverlay, 1_250_000, 1);
    s = bulkSave(s, bulk, 2); // bulk lands before the inline refresh does
    expect(s.overrides).toEqual({});
    s = reduce(s, { type: "rowsArrived", server: server({ [KEY]: 2_000_000 }) });
    expect(shownPrice(s, KEY, 2_000_000)).toBe(2_000_000);
  });

  it("a stale single-cell response cannot restore an overlay a newer bulk save replaced", () => {
    // Inline save starts (version 1), bulk starts and finishes (version 2), then inline returns.
    let s = bulkSave(emptyOverlay, bulk, 2);
    s = inlineSave(s, 1_250_000, 1);
    expect(s.overrides).toEqual({});
    s = reduce(s, { type: "rowsArrived", server: server({ [KEY]: 2_000_000 }) });
    expect(shownPrice(s, KEY, 2_000_000)).toBe(2_000_000);
  });

  it("a stale response cannot restore an overlay after newer rows already arrived", () => {
    let s = reduce(emptyOverlay, { type: "refreshRequested", version: 3 });
    s = reduce(s, { type: "rowsArrived", server: server({ [KEY]: 2_000_000 }) });
    s = inlineSave(s, 1_250_000, 2);
    expect(shownPrice(s, KEY, 2_000_000)).toBe(2_000_000);
  });

  it("an older save's response never replaces a newer one on the same cell", () => {
    let s = inlineSave(emptyOverlay, 1_300_000, 2);
    s = inlineSave(s, 1_250_000, 1);
    expect(shownPrice(s, KEY, 1_000_000)).toBe(1_300_000);
  });

  it("rows refreshed for an older save keep a newer overlay until its own refresh", () => {
    let s = inlineSave(emptyOverlay, 1_250_000, 1);
    s = reduce(s, { type: "saved", key: KEY, planCode: "EP", value: 1_400_000, version: 2 });
    s = reduce(s, { type: "rowsArrived", server: server({ [KEY]: 1_250_000 }) }); // refresh for 1
    expect(shownPrice(s, KEY, 1_250_000)).toBe(1_400_000);
    s = reduce(s, { type: "refreshRequested", version: 2 });
    s = reduce(s, { type: "rowsArrived", server: server({ [KEY]: 1_400_000 }) });
    expect(s.overrides).toEqual({});
  });

  it("bulk clears only overlays inside its rooms, plans, dates and weekdays", () => {
    const keys = {
      inside: cellKey("villa", "ep", "2026-12-05"), // Saturday
      weekday: cellKey("villa", "ep", "2026-12-07"), // Monday
      otherPlan: cellKey("villa", "cp", "2026-12-05"),
      otherRoom: cellKey("cottage", "ep", "2026-12-05"),
      outside: cellKey("villa", "ep", "2027-01-01"), // Friday, after `to`
    };
    let s = emptyOverlay;
    let v = 0;
    for (const [name, key] of Object.entries(keys))
      s = reduce(s, {
        type: "saved",
        key,
        planCode: name === "otherPlan" ? "CP" : "EP",
        value: 100,
        version: ++v,
      });
    s = reduce(s, { type: "bulkSaved", scope: bulk, version: ++v });
    expect(Object.keys(s.overrides).sort()).toEqual(
      [keys.weekday, keys.otherPlan, keys.otherRoom, keys.outside].sort(),
    );
  });
});
