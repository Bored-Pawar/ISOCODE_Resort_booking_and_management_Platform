import { headers } from "next/headers";
import { createLimiter, type RateRule } from "./window";

export { createLimiter, type RateRule, type RateResult } from "./window";

const MIN = 60_000;
/**
 * Limits per action, per instance, in memory. Each window is checked first and charged only when
 * every window passes, so a refused request spends nothing. The strict window is IP + id, so
 * knowing someone's email or phone is not enough to lock them out from elsewhere; the id-only
 * window is loose and caps distributed guessing. Login reserves a hit before the password check
 * (so parallel guesses are counted) and refunds it when the login succeeds.
 */
export const RATE_RULES = {
  login: {
    ip: { limit: 30, windowMs: 15 * MIN },
    ipId: { limit: 8, windowMs: 15 * MIN },
    id: { limit: 50, windowMs: 15 * MIN },
  },
  signup: { ip: { limit: 20, windowMs: 60 * MIN }, id: { limit: 3, windowMs: 60 * MIN } },
  enquiry: {
    ip: { limit: 6, windowMs: 10 * MIN },
    ipId: { limit: 3, windowMs: 10 * MIN },
    id: { limit: 10, windowMs: 10 * MIN },
  },
  hold: { ip: { limit: 30, windowMs: 10 * MIN }, id: { limit: 20, windowMs: 10 * MIN } },
  pay: { ip: { limit: 30, windowMs: 10 * MIN }, id: { limit: 20, windowMs: 10 * MIN } },
} satisfies Record<string, Record<string, RateRule>>;
export type RateAction = Exclude<keyof typeof RATE_RULES, "login">;

export const RATE_LIMITED_MESSAGE = "Too many attempts. Please wait a few minutes and try again.";

type Limiter = ReturnType<typeof createLimiter>;
const limiters = Object.fromEntries(
  Object.entries(RATE_RULES).map(([name, rules]) => [
    name,
    Object.fromEntries(Object.entries(rules).map(([k, r]) => [k, createLimiter(r)])),
  ]),
) as Record<keyof typeof RATE_RULES, Record<string, Limiter>>;

/**
 * Client IP. `x-forwarded-for` is trusted only on Vercel, whose edge overwrites it with the real
 * client first. Elsewhere (plain `pnpm dev` / `pnpm start`) the client controls that header, so
 * there is no IP window at all (null): only the id windows apply, and a rotating header gains
 * nothing.
 */
export function ipFrom(
  h: Pick<Headers, "get">,
  trustForwarded = !!process.env.VERCEL,
): string | null {
  if (!trustForwarded) return null;
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || h.get("x-real-ip")?.trim() || "unknown").slice(0, 64);
}

/** Emails lower-cased; phone numbers reduced to their last 10 digits (one budget per number). */
export function normaliseId(id: string): string {
  const v = id.trim().toLowerCase();
  if (v.includes("@")) return v;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-10) : v;
}

async function clientIp(): Promise<string | null> {
  try {
    return ipFrom(await headers());
  } catch {
    return null; // outside a request (unit tests): only the id windows apply
  }
}

type Window = [Limiter, string | null];

/** The windows of one action for this client and id. */
function windowsFor(set: Record<string, Limiter>, ip: string | null, id: string | null): Window[] {
  return [
    [set.ip, ip],
    ...(set.ipId ? [[set.ipId, id ? `${ip ?? "none"}|${id}` : null] as Window] : []),
    [set.id, id],
  ];
}

/** True when every window passes; then charges all of them if `charge`. */
function gate(windows: Window[], charge: boolean): boolean {
  const used = windows.filter((w): w is [Limiter, string] => w[1] !== null);
  if (!used.every(([l, k]) => l.check(k).ok)) return false;
  if (charge) for (const [l, k] of used) l.record(k);
  return true;
}

/**
 * True when the request may proceed (and it is then counted). `id` is an email, contact or user
 * id; omit it when not known yet.
 */
export async function allow(action: RateAction, id?: string | null): Promise<boolean> {
  const ip = await clientIp();
  return gate(windowsFor(limiters[action], ip, id ? normaliseId(id) : null), true);
}

/**
 * Login: when `ok`, one hit is already reserved in every window (so N parallel guesses count as
 * N). Call `succeeded()` after a correct password to refund it; failures keep the charge.
 */
export async function loginGate(email: string): Promise<{ ok: boolean; succeeded: () => void }> {
  const ip = await clientIp();
  const windows = windowsFor(limiters.login, ip, normaliseId(email));
  const ok = gate(windows, true);
  return {
    ok,
    succeeded: () => {
      if (ok) for (const [lim, k] of windows) if (k !== null) lim.unrecord(k);
    },
  };
}

/** Test helper. */
export function resetRateLimits() {
  for (const set of Object.values(limiters)) for (const l of Object.values(set)) l.reset();
}
