import { headers } from "next/headers";
import { createLimiter, type RateRule } from "./window";

export { createLimiter, type RateRule, type RateResult } from "./window";

const MIN = 60_000;
/** Limits per action, each checked per IP and per email (or guest id). Per instance, in memory. */
export const RATE_RULES = {
  login: { ip: { limit: 30, windowMs: 15 * MIN }, id: { limit: 8, windowMs: 15 * MIN } },
  signup: { ip: { limit: 6, windowMs: 60 * MIN }, id: { limit: 3, windowMs: 60 * MIN } },
  enquiry: { ip: { limit: 6, windowMs: 10 * MIN }, id: { limit: 3, windowMs: 10 * MIN } },
  hold: { ip: { limit: 30, windowMs: 10 * MIN }, id: { limit: 20, windowMs: 10 * MIN } },
  pay: { ip: { limit: 30, windowMs: 10 * MIN }, id: { limit: 20, windowMs: 10 * MIN } },
} satisfies Record<string, { ip: RateRule; id: RateRule }>;
export type RateAction = keyof typeof RATE_RULES;

export const RATE_LIMITED_MESSAGE = "Too many attempts. Please wait a few minutes and try again.";

const limiters = Object.fromEntries(
  Object.entries(RATE_RULES).map(([name, r]) => [
    name,
    { ip: createLimiter(r.ip), id: createLimiter(r.id) },
  ]),
) as Record<
  RateAction,
  { ip: ReturnType<typeof createLimiter>; id: ReturnType<typeof createLimiter> }
>;

/** First hop of x-forwarded-for (set by Vercel), else x-real-ip, else "unknown". */
export function ipFrom(h: Pick<Headers, "get">): string {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || h.get("x-real-ip")?.trim() || "unknown").slice(0, 64);
}

/**
 * True when the request may proceed. Both windows are charged; either one over its limit
 * refuses. `id` is an email, contact or user id (lower-cased); omit it when not known yet.
 */
export async function allow(action: RateAction, id?: string | null): Promise<boolean> {
  let ip: string | null = null;
  try {
    ip = ipFrom(await headers());
  } catch {
    ip = null; // outside a request (unit tests): only the id window applies
  }
  const byIp = ip ? limiters[action].ip.hit(ip) : { ok: true as const };
  const key = id?.trim().toLowerCase();
  const byId = key ? limiters[action].id.hit(key) : { ok: true as const };
  return byIp.ok && byId.ok;
}

/** Test helper. */
export function resetRateLimits() {
  for (const l of Object.values(limiters)) {
    l.ip.reset();
    l.id.reset();
  }
}
