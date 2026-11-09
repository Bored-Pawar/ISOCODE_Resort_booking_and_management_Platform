import { headers } from "next/headers";
import { createLimiter, type RateRule } from "./window";

export { createLimiter, type RateRule, type RateResult } from "./window";

const MIN = 60_000;
/**
 * Limits per action, per instance, in memory. Each window is checked first and charged only when
 * every window passes, so a refused request spends nothing. Login is different: only failed
 * logins are charged, and the strict window is IP + email, so knowing a staff email is not
 * enough to lock that person out from elsewhere (the email-only window is loose and caps
 * distributed guessing).
 */
export const RATE_RULES = {
  login: {
    ip: { limit: 30, windowMs: 15 * MIN },
    ipId: { limit: 8, windowMs: 15 * MIN },
    id: { limit: 50, windowMs: 15 * MIN },
  },
  signup: { ip: { limit: 20, windowMs: 60 * MIN }, id: { limit: 3, windowMs: 60 * MIN } },
  enquiry: { ip: { limit: 6, windowMs: 10 * MIN }, id: { limit: 3, windowMs: 10 * MIN } },
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
 * client first; elsewhere (plain `pnpm start`) the client controls that header, so every request
 * shares one bucket rather than letting a rotating header bypass the window.
 */
export function ipFrom(h: Pick<Headers, "get">, trustForwarded = !!process.env.VERCEL): string {
  if (!trustForwarded) return "direct";
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
  const l = limiters[action];
  return gate(
    [
      [l.ip, ip],
      [l.id, id ? normaliseId(id) : null],
    ],
    true,
  );
}

/** Login: `ok` says whether to try at all; call `failed()` after a wrong password. */
export async function loginGate(email: string): Promise<{ ok: boolean; failed: () => void }> {
  const ip = await clientIp();
  const id = normaliseId(email);
  const l = limiters.login;
  const windows: Window[] = [
    [l.ip, ip],
    [l.ipId, `${ip ?? "none"}|${id}`],
    [l.id, id],
  ];
  return {
    ok: gate(windows, false),
    failed: () => {
      for (const [lim, k] of windows) if (k !== null) lim.record(k);
    },
  };
}

/** Test helper. */
export function resetRateLimits() {
  for (const set of Object.values(limiters)) for (const l of Object.values(set)) l.reset();
}
