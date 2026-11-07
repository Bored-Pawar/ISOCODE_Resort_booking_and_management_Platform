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
| AI | Vercel AI SDK `generateObject`, provider set by env (see `04-ai-router.md`) |
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
    admin/          admin services, export
  lib/              auth (requireRole, requireGuestOwner), db client, money, dates
  db/               schema/, migrations/, seed/         [LOCKED]
tests/
docs/
```

Each module exposes only `index.ts`. UI and route handlers call module services, never tables directly.

S1 approved narrow exception (R01): the `booking` module, as transaction owner, may import `pricing/internal.ts` and `inventory/internal.ts` and pass a shared `Tx`. These internal helpers are not public service exports and never open/commit their own transaction. UI and route handlers continue to import public `index.ts` interfaces only. See `01-booking-core.md` § Contracts.

B1+B2 review-fix exceptions: `inventory/index.ts` may call the internal booking-owned scoped lazy-expiry wrapper (mandatory stay date range; optional room type). It opens the expiry transaction inside booking and never calls the site-wide sweep. Seed code and tests may import the pure `pricing/calculation.ts` implementation directly to share price snapshot calculations. Public service contracts remain unchanged; see `01-booking-core.md` § Contracts.

## Security
1. Role checks inside every server action and route handler. Middleware only redirects.
2. Guests can read only their own bookings.
3. Secrets only in env. `.env.example` lists names.
4. Inbound webhooks check a shared secret header.

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
| `AI_PROVIDER` | `google`, `anthropic`, `local`, or `rules` |
| `AI_MODEL` | Model id for the provider |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini |
| `ANTHROPIC_API_KEY` | Optional |
| `LOCAL_AI_BASE_URL` | OpenAI compatible local server, e.g. Ollama |
| `INBOUND_WEBHOOK_SECRET` | Shared secret for `/api/inbound/email` and `/api/inbound/whatsapp`, sent in the `x-inbound-secret` header. Missing or wrong: 401 |
| `DEV_TOOLS_ENABLED` | `true` turns on the hidden `/dev` area (UI kit, inbound simulator, dev login). Anything else, or unset: every `/dev` URL is a 404. Leave off in production |
| `CRON_SECRET` | Vercel Cron auth |
| `HOLD_MINUTES` | Default 10 |
| `TEST_DATABASE_URL` | Required for `test:integration`. A separate Neon branch (direct string). No fallback; must not share a host with `DATABASE_URL*` |
| `DB_PROTECTED_HOSTS` | Comma separated host fragments that `db:seed`, `db:reset` and the integration tests refuse to touch (e.g. the production endpoint) |
| `DB_TARGET` | Internal. Set to `test` by the integration tests for the seed child process so it targets `TEST_DATABASE_URL`. Never set by hand |

## Enquiry intake and the dev area (Q1–Q3)
1. **One row, many doors.** Web form, email webhook and WhatsApp webhook all call `enquiries.ingestFrom()`; the row is saved with `ai_status='pending'` before any AI call. Contact is normalised (email lower-cased, phone digits with one leading `+`) and never logged.
2. **Webhooks** (`/api/inbound/email`, `/api/inbound/whatsapp`): authenticated by the `x-inbound-secret` header against `INBOUND_WEBHOOK_SECRET` (constant-time, fails closed when unset), not by a session, so they do not call `requireRole()`. Payloads follow Postmark inbound JSON and the Meta Cloud API webhook. Idempotent on the provider message id; a repeat returns the original enquiry id.
3. **`/dev`** exists only when `DEV_TOOLS_ENABLED=true`. `proxy.ts` answers 404 otherwise and redirects signed-out visitors to `/dev/login`; every page and server action also calls `requireDevStaff()` (flag plus `requireRole` for staff). Guests get a 404. All pages are `noindex` and nothing links to `/dev` from guest or staff navigation.
4. **Web form** (`/enquire`) is a public entry point validated with Zod; spam control beyond a honeypot field (rate limiting) is deferred to H2.
