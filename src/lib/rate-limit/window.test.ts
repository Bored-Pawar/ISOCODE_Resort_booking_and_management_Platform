import { describe, expect, it } from "vitest";
import { createLimiter } from "./window";
import { ipFrom, normaliseId } from "./index";

describe("sliding window limiter", () => {
  it("allows up to the limit, then refuses until the oldest hit leaves the window", () => {
    const l = createLimiter({ limit: 3, windowMs: 1000 });
    expect([0, 100, 200].map((t) => l.hit("a", t).ok)).toEqual([true, true, true]);
    expect(l.hit("a", 300)).toEqual({ ok: false, retryAfterMs: 700 });
    expect(l.hit("a", 999).ok).toBe(false);
    expect(l.hit("a", 1000).ok).toBe(true);
  });
  it("check never charges", () => {
    const l = createLimiter({ limit: 1, windowMs: 1000 });
    for (let i = 0; i < 5; i++) expect(l.check("a", i).ok).toBe(true);
    l.record("a", 10);
    expect(l.check("a", 11).ok).toBe(false);
  });
  it("keys are independent", () => {
    const l = createLimiter({ limit: 1, windowMs: 1000 });
    expect(l.hit("a", 0).ok).toBe(true);
    expect(l.hit("b", 0).ok).toBe(true);
    expect(l.hit("a", 1).ok).toBe(false);
  });
  it("refused hits do not extend the window", () => {
    const l = createLimiter({ limit: 1, windowMs: 1000 });
    l.hit("a", 0);
    for (let t = 1; t < 1000; t += 100) l.hit("a", t);
    expect(l.hit("a", 1000).ok).toBe(true);
  });
  it("a flood of new keys cannot evict a live counter; new keys are refused while full", () => {
    const l = createLimiter({ limit: 1, windowMs: 60_000 }, 100);
    l.hit("victim", 0);
    for (let i = 0; i < 500; i++) l.hit(`k${i}`, 1 + i);
    expect(l.check("victim", 600).ok).toBe(false);
    expect(l.check("fresh", 600).ok).toBe(false);
    // Once the window has passed, pruning frees the map.
    expect(l.check("fresh", 61_000).ok).toBe(true);
  });
  it("trusts x-forwarded-for only on Vercel", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    expect(ipFrom(h({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }), true)).toBe("203.0.113.5");
    expect(ipFrom(h({ "x-real-ip": "198.51.100.2" }), true)).toBe("198.51.100.2");
    expect(ipFrom(h({ "x-forwarded-for": "203.0.113.5" }), false)).toBe("direct");
  });
  it("normalises contacts: one budget per email or phone number", () => {
    expect(normaliseId(" A@Example.test ")).toBe("a@example.test");
    expect(new Set(["98765 43210", "+91 9876543210", "9876543210"].map(normaliseId)).size).toBe(1);
  });
});
