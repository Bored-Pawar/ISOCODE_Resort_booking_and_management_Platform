/**
 * In-memory sliding-window rate limiter (H2). Per server instance only: on Vercel each warm
 * function instance keeps its own window, so the effective limit is "per instance". Good enough
 * to blunt credential stuffing and form spam on the demo; a shared store (e.g. Upstash) is the
 * production step. Pure apart from the clock, so it is unit tested without a server.
 */
export type RateRule = { limit: number; windowMs: number };
export type RateResult = { ok: true } | { ok: false; retryAfterMs: number };

/** Bound on tracked keys so a flood of distinct keys cannot grow memory without limit. */
const MAX_KEYS = 10_000;

export function createLimiter(rule: RateRule) {
  const hits = new Map<string, number[]>();
  function prune(now: number) {
    for (const [key, times] of hits) {
      const live = times.filter((t) => now - t < rule.windowMs);
      if (live.length) hits.set(key, live);
      else hits.delete(key);
    }
  }
  return {
    /** Records one hit for `key` and says whether it is within the limit. */
    hit(key: string, now = Date.now()): RateResult {
      if (hits.size >= MAX_KEYS) prune(now);
      if (hits.size >= MAX_KEYS) hits.delete(hits.keys().next().value as string);
      const live = (hits.get(key) ?? []).filter((t) => now - t < rule.windowMs);
      if (live.length >= rule.limit) {
        hits.set(key, live);
        return { ok: false, retryAfterMs: rule.windowMs - (now - live[0]) };
      }
      live.push(now);
      hits.set(key, live);
      return { ok: true };
    },
    reset() {
      hits.clear();
    },
  };
}
