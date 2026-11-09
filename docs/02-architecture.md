# 02 Architecture

## Style
Modular monolith: one Next.js app, one Postgres database, one deploy. Strict module boundaries. Modules may share a DB transaction (`tx` passed in) for coordinated writes such as hold + booking + price snapshot.

Why: one developer, about 72 hours, single deploy. Microservices add networking and deploy cost with no scoring benefit. The AI router can be split out later if load demands it.

## Stack
| Layer | Choice |
|---|---|
| App | Next.js (App Router), TypeScript, Server Components and Server Actions |
| UI | Tailwind CSS, shadcn/ui restyled to `05-design-system.md` |
| DB | PostgreSQL on Neon |
| ORM | Drizzle (raw SQL allowed for locking queries) |
| Auth | Auth.js credentials, `users.role` |
| Validation | Zod on every input and every AI output |
| AI | Vercel AI SDK 7 `generateText` + `Output.object`, provider set by env (see `04-ai-router.md`) |
| Tests | Vitest (unit + Postgres integration), Playwright (one end to end booking) |
| Deploy | Vercel + Neon, Vercel Cron |
| Package manager | pnpm |

## Folder layout
```
src/
  app/
    (guest)/        rooms, book, booking/[ref], enquire
    (staff)/admin/  rates, allotment, blackouts, promos, inbox
    api/            inbound/email, inbound/whatsapp, payments/mock, cron/*
  modules/
    catalog/        room types, photos, rate plans
    inventory/      allotment, holds, blackouts        [LOCKED]
    pricing/        rates, promos, GST, quote()
    booking/        state machine, flow                [LOCKED]
    payments/       PaymentProvider + MockProvider     [LOCKED]
    enquiries/      inbox, channels, audit
    ai-router/      classify, route, draft, fallback
    ai-provider/    provider selection and structured SDK transport only
    admin/          admin services, export
  lib/              auth (requireRole, requireGuestOwner), db client, money, dates
  db/               schema/, migrations/, seed/         [LOCKED]
tests/
docs/
```

Each module exposes only `index.ts`. UI and route handlers call module services, never tables directly.

S2 admin (runbook `s2-admin-rbac-runbook.md`): admin writes live next to the tables they own, `pricing/admin.ts` (rates, promos) and `inventory/admin.ts` (allotment, blackouts), and are reached only through `modules/admin/index.ts`. Client components import the pure `modules/admin/rules.ts` and `schemas.ts` directly (no database code). `inventory/admin.ts` calls the booking-owned scoped lazy expiry (same import as `inventory/index.ts`) and the public `booking.listForStaff` for the blackout warning list.

S1 approved narrow exception (R01): the `booking` module, as transaction owner, may import `pricing/internal.ts` and `inventory/internal.ts` and pass a shared `Tx`. These internal helpers are not public service exports and never open/commit their own transaction. UI and route handlers continue to import public `index.ts` interfaces only. See `01-booking-core.md` § Contracts.

B1+B2 review-fix exceptions: `inventory/index.ts` may call the internal booking-owned scoped lazy-expiry wrapper (mandatory stay date range; optional room type). It opens the expiry transaction inside booking and never calls the site-wide sweep. Seed code and tests may import the pure `pricing/calculation.ts` implementation directly to share price snapshot calculations. Public service contracts remain unchanged; see `01-booking-core.md` § Contracts.

## Security
S2 approved D6 internal exception: only `ai-router` consumes `enquiries/internal.ts` queue claims, snapshot reads and transaction-aware settlement. Claims and settlement open short enquiries-owned transactions; no transaction spans a provider call. Settlement locks the enquiry, verifies attempt/timestamp generation and staff state, and atomically saves classification, an unapproved draft, alert and audit event. No schema/migration changes.

Staff eligibility (D2): `users` has no active/disabled flag. All existing accounts with the exact target staff role are eligible, ordered `created_at ASC, id ASC`; missing staff keeps the row unsorted. The first GM receives complaint/unsorted alerts; without a GM account the complaint flag and unsorted lane remain visible, but a notification cannot be inserted without a recipient.

1. Role checks inside every server action and route handler. Middleware only redirects. Staff entry points use `requirePermission(capability)` from `src/lib/auth/permissions.ts` (one role x capability table; `navFor` builds the staff nav from it, `enquiryVisibility` filters the inbox). A staff page the role cannot use renders the 403 screen; its actions return `FORBIDDEN`.
2. Guests can read only their own bookings.
3. Secrets only in env. `.env.example` lists names.
4. Inbound webhooks check a shared secret header.
5. **Rate limits (H2)**, `src/lib/rate-limit`: in-memory sliding window, checked per client IP and per email, contact (phone reduced to its last 10 digits) or guest id. Every window is checked before any is charged, so a refused request spends nothing; a full key map (10,000 live keys per window) never evicts live counters; new keys then share one counted overflow bucket. The IP is the first `x-forwarded-for` hop **only on Vercel** (its edge sets it); elsewhere the header is client controlled, so there is no IP window and only the id windows apply. Login (guest, staff, `/dev/login`) charges every attempt before the password check, success or not, and never refunds (next-auth reports a failed login as a redirect when the client sends `X-Auth-Return-Redirect`, so a refund on "not an AuthError" would be abusable): 30 per IP (IPv6 per /64), 20 per IP + email, 50 per email per 15 min. One network cannot lock an email out; a distributed attacker can, per instance, for 15 min. The HTTP credentials endpoints (`POST /api/auth/callback/*`, `/api/auth/signin/*`) are refused (404), because they would run `authorize` without the limiter; the app signs in only through the server actions. When a window's key map is full (10,000 live keys), new keys share one counted bucket, so a large flood can make new clients wait up to one window; tracked clients are unaffected; sign up 20 per IP and 3 per email per hour; `/enquire` 6 per IP, 3 per IP + contact and 10 per contact per 10 min; hold (and hold again) and pay 30 per IP and 20 per guest per 10 min. **Per server instance**: each warm Vercel instance has its own window, so this blunts stuffing and spam but is not a global limit; a shared store (Upstash or Postgres) is the production step. Refusals say "Too many attempts. Please wait a few minutes and try again."
6. **Security headers (H2)**, `next.config.ts` `headers()`, every route: CSP (`default-src 'self'`; scripts `'self' 'unsafe-inline'` because the App Router streams inline bootstrap scripts and nonces would make every page dynamic and lose partial prerendering; styles `'self' 'unsafe-inline'`; images `'self' data: blob:`; fonts `'self'` (next/font is self hosted); `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests` on Vercel only). Trade-off: `'unsafe-inline'` scripts mean the CSP does not stop an injected inline script; React escaping and no `dangerouslySetInnerHTML` are the XSS defence, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera, microphone, geolocation, payment off), HSTS two years with subdomains, no `X-Powered-By`. Dev adds `'unsafe-eval'` and `ws:` for React dev tooling.
7. **Forms keep input on failure**: React 19 resets uncontrolled fields after a form action, so auth, hold and enquire actions return the non secret values plus an `attempt` number; fields use `defaultValue` and the form remounts with `key={attempt}`. Passwords are never returned. Login failure always says "Email or password is incorrect."
8. **Logs**: caught errors are logged with `safeError()` (`src/lib/log.ts`): class name and SQLSTATE only, never the message or object (drizzle messages carry bound values).

## Performance budget (slow hill networks)
1. Each guest page adds no more than 30 KB (gzip) of its own JS above the framework baseline (about 120 KB gzip: React DOM and the Next client). Decided by the scrum master after S1 G1 measured a 100 KB total as unreachable on this stack. The baseline is recorded in `tdd-notes.md`.
2. Hard target: LCP under 2.5 s on Lighthouse Slow 4G, measured in H3.
3. Hero image under 150 KB, AVIF/WebP via `next/image`, blur placeholders, lazy below the fold.
4. One self hosted variable font or system fonts.
5. Room pages render on the server; no client side data fetching.

## Environment variables (names only)
| Name | Purpose |
|---|---|
| `DATABASE_URL` | Neon pooled connection |
| `DATABASE_URL_UNPOOLED` | Direct connection: migrations, `db:seed`, `db:reset` (development branch) |
| `AUTH_SECRET` | Auth.js |
| `AI_PROVIDER` | `google`, `anthropic`, `local`, `groq`, or `rules` |
| `AI_MODEL` | Model id for the provider |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini |
| `ANTHROPIC_API_KEY` | Optional |
| `LOCAL_AI_BASE_URL` | OpenAI compatible local server, e.g. Ollama |
| `GROQ_API_KEY_1` to `GROQ_API_KEY_4` | Groq keys for `AI_PROVIDER=groq`, tried in order 1 to 4, empty ones skipped. A key hitting 429/401/403 cools down (Retry-After, else 60 s) and the next is used. Suggested `AI_MODEL`: `openai/gpt-oss-20b` |
| `INBOUND_WEBHOOK_SECRET` | Shared secret for `/api/inbound/email` and `/api/inbound/whatsapp`, sent in the `x-inbound-secret` header. Missing or wrong: 401 |
| `DEV_TOOLS_ENABLED` | `true` turns on the hidden `/dev` area (UI kit, inbound simulator, dev login). Anything else, or unset: every `/dev` URL is a 404. Leave off in production |
| `CRON_SECRET` | Vercel Cron auth |
| `PAYMENT_WEBHOOK_SECRET` | B7 mock gateway: HMAC SHA-256 key for `/api/payments/mock` (signature in `x-payment-signature`, hex over the raw body). At least 16 characters. Missing or short: every webhook is 401, so test payments cannot confirm. Set per environment (F6 deploy note) |
| `HOLD_MINUTES` | Default 10 |
| `TEST_DATABASE_URL` | Required for `test:integration`. A separate Neon branch (direct string). No fallback; must not share a host with `DATABASE_URL*` |
| `DB_PROTECTED_HOSTS` | Comma separated host fragments that `db:seed`, `db:reset` and the integration tests refuse to touch (e.g. the production endpoint) |
| `DB_TARGET` | Internal. Set to `test` by the integration tests for the seed child process so it targets `TEST_DATABASE_URL`. Never set by hand |

## Enquiry intake and the dev area (Q1–Q3)
1. **One row, many doors.** Web form, email webhook and WhatsApp webhook all call `enquiries.ingestFrom()`; the row is saved with `ai_status='pending'` before any AI call. Contact is normalised (email lower-cased, phone digits with one leading `+`) and never logged.
2. **Webhooks** (`/api/inbound/email`, `/api/inbound/whatsapp`): authenticated by the `x-inbound-secret` header against `INBOUND_WEBHOOK_SECRET` (constant-time, fails closed when unset), not by a session, so they do not call `requireRole()`. Payloads follow Postmark inbound JSON and the Meta Cloud API webhook. Idempotent on the provider message id; a repeat returns the original enquiry id.
3. **`/dev`** exists only when `DEV_TOOLS_ENABLED=true`. `proxy.ts` answers 404 otherwise and redirects signed-out visitors to `/dev/login`; every page and server action also calls `requireDevStaff()` (flag plus `requireRole` for staff). Guests get a 404. All pages are `noindex` and nothing links to `/dev` from guest or staff navigation.
4. **Web form** (`/enquire`) is a public entry point validated with Zod; spam control beyond a honeypot field (rate limiting) is deferred to H2.

## Machine and public entry points without a session role (B10 minor fix 3)
CLAUDE.md rule 5 requires `requireRole()` or `requireGuestOwner()` on every server action and route handler. These are the recorded exemptions; each still validates its input with Zod.
1. **Cron** (`/api/cron/expire-holds`): a machine endpoint with no user session. It requires `Authorization: Bearer <CRON_SECRET>` (fails closed when unset or wrong) instead of `requireRole()`. The approved M4 extension calls `booking.releaseExpiredHolds()` plus the additive `ai-router.recoverEnquiries` export for one bounded recovery batch, with a 60-second route duration. Existing public process/list signatures remain unchanged.
2. **Inbound webhooks** and the **`/enquire` form**: see "Enquiry intake and the dev area" above.
2a. **Mock payment webhook** (`/api/payments/mock`, B7): a machine endpoint with no user session. It requires a valid `x-payment-signature` (HMAC SHA-256 of the raw body with `PAYMENT_WEBHOOK_SECRET`, compared in constant time, fails closed when the secret is unset), then validates the body with Zod and only calls `booking.confirmPayment`. `MockProvider` delivers to the same handler function in process (no request-derived URL). The guest's pay action itself calls `requireRole('guest')`.
3. **`/book` room cart (B6 step 1)**: a server-rendered page, not an action. It reads the cart from the URL and calls the public `catalog`, `inventory.availability` and `pricing.quote` reads, which take no hold and write nothing (lazy expiry aside, which is booking-owned). The hold itself is taken later by `acquireBookingHold`, which calls `requireRole('guest')`.
