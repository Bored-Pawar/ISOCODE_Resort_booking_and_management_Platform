/**
 * In-memory sliding-window rate limiter (H2). Per server instance only: on Vercel each warm
 * function instance keeps its own window, so the effective limit is "per instance". Good enough
 * to blunt credential stuffing and form spam on the demo; a shared store (e.g. Upstash) is the
 * production step. Pure apart from the clock, so it is unit tested without a server.
 *
 * `check` only looks; `record` charges one hit. Callers check every window first and record only
 * when all pass, so a refused request never spends budget. When the key map is full of live
 * counters, new keys share one counted overflow bucket: live counters are never evicted (a flood
 * cannot reset a victim's window) and overflow keys are still limited, together.
 */
export type RateRule = { limit: number; windowMs: number };
export type RateResult = { ok: true } | { ok: false; retryAfterMs: number };

/** Bound on tracked keys so a flood of distinct keys cannot grow memory without limit. */
export const MAX_KEYS = 10_000;

export function createLimiter(rule: RateRule, maxKeys = MAX_KEYS) {
  const hits = new Map<string, number[]>();
  let lastPrune = -Infinity;
  const live = (key: string, now: number) =>
    (hits.get(key) ?? []).filter((t) => now - t < rule.windowMs);
  /** Drops expired keys; at most once a second, so a flood does not scan the map per request. */
  function prune(now: number) {
    if (now - lastPrune < 1000) return;
    lastPrune = now;
    for (const [key, times] of hits) {
      const kept = times.filter((t) => now - t < rule.windowMs);
      if (kept.length) hits.set(key, kept);
      else hits.delete(key);
    }
  }
  const OVERFLOW = "\u0000overflow";
  /** The key actually counted: itself, or the shared overflow bucket when the map is full. */
  const slot = (key: string, now: number) => {
    if (hits.has(key) || hits.size < maxKeys) return key;
    prune(now);
    return hits.size < maxKeys ? key : OVERFLOW;
  };
  const limiter = {
    check(key: string, now = Date.now()): RateResult {
      const times = live(slot(key, now), now);
      if (times.length >= rule.limit)
        return { ok: false, retryAfterMs: rule.windowMs - (now - times[0]) };
      return { ok: true };
    },
    record(key: string, now = Date.now()) {
      const k = slot(key, now);
      const times = live(k, now);
      times.push(now);
      hits.set(k, times);
    },
    /** check then record: one call for a caller with a single window. */
    hit(key: string, now = Date.now()): RateResult {
      const r = limiter.check(key, now);
      if (r.ok) limiter.record(key, now);
      return r;
    },
    reset() {
      hits.clear();
      lastPrune = -Infinity;
    },
  };
  return limiter;
}
