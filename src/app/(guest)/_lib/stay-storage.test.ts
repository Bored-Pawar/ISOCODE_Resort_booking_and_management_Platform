import { describe, expect, it } from "vitest";
import { encodeLine } from "./cart";
import { clearStoredStay, readStoredStay, STAY_STORAGE_KEY, writeStoredStay } from "./stay-storage";

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}
const stay = { checkIn: "2026-11-20", checkOut: "2026-11-22", adults: 4, children: 1 };
const a = { roomTypeId: "rt-a", ratePlanId: "rp-a", adults: 2, children: 1 };
const b = { roomTypeId: "rt-b", ratePlanId: "rp-b", adults: 2, children: 0 };

describe("stored stay", () => {
  it("round-trips dates, group and lines in order", () => {
    const s = memory();
    writeStoredStay(stay, [b, a], s);
    expect(readStoredStay(s)).toEqual({
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      party: { adults: 4, children: 1 },
      lines: [b, a],
      dropped: false,
    });
  });
  it("cleans a tampered value through the URL parser", () => {
    const s = memory();
    s.setItem(STAY_STORAGE_KEY, `room=${encodeLine(a)}&room=bad&checkIn=nope`);
    const read = readStoredStay(s)!;
    expect(read.lines).toEqual([a]);
    expect(read.checkIn).toBe("");
    expect(read.dropped).toBe(true);
  });
  it("is empty after clearing, and never throws when storage does", () => {
    const s = memory();
    writeStoredStay(stay, [a], s);
    clearStoredStay(s);
    expect(readStoredStay(s)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readStoredStay(broken)).toBeNull();
    expect(() => writeStoredStay(stay, [a], broken)).not.toThrow();
    expect(() => clearStoredStay(broken)).not.toThrow();
    expect(readStoredStay(null)).toBeNull();
  });
});
