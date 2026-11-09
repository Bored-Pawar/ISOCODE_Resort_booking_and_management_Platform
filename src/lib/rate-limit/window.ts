/**
 * In-memory sliding-window rate limiter (H2). Per server instance only: on Vercel each warm
 * function instance keeps its own window, so the effective limit is "per instance". Good enough
 * to blunt credential stuffing and form spam on the demo; a shared store (e.g. Upstash) is the
 * production step. Pure apart from the clock, so it is unit tested without a server.
 *
 * `check` only looks; `record` charges one hit; `unrecord` refunds the newest. Callers check every
 * window first and record only when all pass, so a refused request never spends budget. When the
 * key map is full of live counters, a new key is let through untracked (fail open): live
 * counters are never evicted, and a flood of fresh keys cannot lock everyone else out.
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
  const full = (key: string, now: number) => {
    if (hits.has(key) || hits.size < maxKeys) return false;
    prune(now);
    return hits.size >= maxKeys;
  };
  const limiter = {
    check(key: string, now = Date.now()): RateResult {
      const times = live(key, now);
      if (times.length >= rule.limit)
        return { ok: false, retryAfterMs: rule.windowMs - (now - times[0]) };
      return { ok: true };
    },
    record(key: string, now = Date.now()) {
      if (full(key, now)) return; // fail open: untracked rather than evicting a live counter
      const times = live(key, now);
      times.push(now);
      hits.set(key, times);
    },
    /** Refunds the newest hit (a reserved attempt that turned out fine). */
    unrecord(key: string) {
      const times = hits.get(key);
      if (!times?.length) return;
      times.pop();
      if (!times.length) hits.delete(key);
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
