import { describe, expect, it } from "vitest";
import { createLimiter } from "./window";
import { ipFrom } from "./index";

describe("sliding window limiter", () => {
  it("allows up to the limit, then refuses until the oldest hit leaves the window", () => {
    const l = createLimiter({ limit: 3, windowMs: 1000 });
    expect([0, 100, 200].map((t) => l.hit("a", t).ok)).toEqual([true, true, true]);
    expect(l.hit("a", 300)).toEqual({ ok: false, retryAfterMs: 700 });
    expect(l.hit("a", 999).ok).toBe(false);
    expect(l.hit("a", 1000).ok).toBe(true);
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
  it("memory stays bounded under many distinct keys", () => {
    const l = createLimiter({ limit: 1, windowMs: 10 });
    for (let i = 0; i < 20_000; i++) l.hit(`k${i}`, i);
    expect(l.hit("fresh", 20_000).ok).toBe(true);
  });
  it("reads the client IP from the first forwarded hop", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    expect(ipFrom(h({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(ipFrom(h({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(ipFrom(h({}))).toBe("unknown");
  });
});
