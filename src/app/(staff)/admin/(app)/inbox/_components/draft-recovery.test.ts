import { describe, expect, it } from "vitest";
import { discardUnsaved, keepUnsaved, recoverable, type RecoveryStore } from "./draft-recovery";

function mapStore(): RecoveryStore & { size: () => number } {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
    size: () => m.size,
  };
}

const OLD = "Garden Villa: From ₹38,350 (room only, including ₹5,850 GST).";
const MINE = `${OLD}\n\nQA unsaved prose marker.`;
const CURRENT = "Garden Villa: From ₹19,175 (room only, including ₹2,925 GST).";

describe("draft recovery (QA-04)", () => {
  it("keeps unsaved prose refused as stale and offers it next to the new draft", () => {
    const s = mapStore();
    expect(keepUnsaved(s, "ENQ-AAAAA", MINE, OLD, new Date("2026-11-09T15:00:00Z"))).toBe(true);
    expect(recoverable(s, "ENQ-AAAAA", CURRENT)).toEqual({
      text: MINE,
      at: "2026-11-09T15:00:00.000Z",
    });
  });

  it("keeps nothing when there were no unsaved changes", () => {
    const s = mapStore();
    expect(keepUnsaved(s, "ENQ-AAAAA", `  ${OLD}  `, OLD)).toBe(false);
    expect(keepUnsaved(s, "ENQ-AAAAA", "   ", OLD)).toBe(false);
    expect(s.size()).toBe(0);
  });

  it("is per enquiry", () => {
    const s = mapStore();
    keepUnsaved(s, "ENQ-AAAAA", MINE, OLD);
    expect(recoverable(s, "ENQ-BBBBB", CURRENT)).toBeNull();
  });

  it("hides the copy once the current draft already says the same", () => {
    const s = mapStore();
    keepUnsaved(s, "ENQ-AAAAA", MINE, OLD);
    expect(recoverable(s, "ENQ-AAAAA", MINE)).toBeNull();
  });

  it("discard removes it; corrupt storage is ignored", () => {
    const s = mapStore();
    keepUnsaved(s, "ENQ-AAAAA", MINE, OLD);
    discardUnsaved(s, "ENQ-AAAAA");
    expect(recoverable(s, "ENQ-AAAAA", CURRENT)).toBeNull();
    s.set("inbox.unsaved.ENQ-AAAAA", "{not json");
    expect(recoverable(s, "ENQ-AAAAA", CURRENT)).toBeNull();
  });
});
