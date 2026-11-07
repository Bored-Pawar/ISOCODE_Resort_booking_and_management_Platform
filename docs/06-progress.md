# 06 Progress

Scrum master: Aditya Pawar. Deadline: 9 Nov 2026, 23:59 IST.
Developers update this file after significant changes. Keep entries one line.

## Ownership of locked areas
Coordination records, not enforcement. The scrum master assigns ownership in chat; developers confirm before editing. Pull `main` before reading this table.

| Area | Paths | Owner | Since |
|---|---|---|---|
| Schema and migrations | `src/db/**` | Aditya Pawar (S0) | 2026-11-07 |
| Booking core | `src/modules/{inventory,booking,payments}/**` | Aditya Pawar (S0) | 2026-11-07 |

## Current sprint
S0: walking skeleton, built by one developer (Aditya Pawar) so the frame is consistent before parallel work starts.
Goal: deployed app where every module exists behind its contract and returns fixtures; schema, seed, auth, CI and UI kit in place.

## S0 tasks (see `07-backlog.md` for AC)
| ID | Task | Owner | Status |
|---|---|---|---|
| F1 | Scaffold | Aditya Pawar | done |
| C1 | Frozen service interfaces + fixtures | Aditya Pawar | done |
| C2 | Quote, hold, payment price contract | Aditya Pawar | done |
| F2 | Schema + migrations | Aditya Pawar | done |
| F3 | Seed data | Aditya Pawar | done |
| F4 | Auth and roles | Aditya Pawar | done |
| F5 | CI | Aditya Pawar | done |
| F6 | Deploy to Vercel + Neon | Aditya Pawar | todo |
| F7 | UI kit from `05` | Aditya Pawar | done |
| D1 | Start `docs/tdd-notes.md` | Aditya Pawar | done |

## Done
1. Docs structure, backlog and design system.
2. S0 (except F6): scaffold, frozen contracts, schema, seed, auth, CI, UI kit, TDD notes. See the summary at the end of this file.

## Blockers
1. Images: scrum master to supply `public/images/*` per shot list in `05`. Until then, use neutral placeholders of the right aspect ratio.

## Decisions log
| Date | Decision |
|---|---|
| 2026-11-06 | Modular monolith on Next.js + TypeScript, Drizzle, Neon, Vercel |
| 2026-11-06 | Booking state machine and inventory rules per `01` |
| 2026-11-06 | AI default provider Gemini free tier; local and rules fallbacks |
| 2026-11-07 | Late payment after expiry: EXPIRED is final, payment REFUND_PENDING, no re-acquire |
| 2026-11-07 | One room per booking in MVP (`units` column kept, validation enforces 1); groups go to enquiry |
| 2026-11-07 | Contracts and fixtures frozen first; UI builds against fixtures |
| 2026-11-07 | `quoteHash` links displayed price to hold; mismatch returns PRICE_CHANGED |
| 2026-11-07 | AI processing via persisted states, `after()`, sweep and Retry; no floating promises |
| 2026-11-07 | Design direction "Quiet estate" per `05` |
| 2026-11-07 | S0 built by a single developer; parallel work starts from S1 |
| 2026-11-07 | S0: Next.js 16 with `cacheComponents`; runtime reads (cookies, searchParams, clock) go inside `<Suspense>` |
| 2026-11-07 | S0: GST slabs seeded as 5% up to Rs 7,500 per night and 18% above, bounds inclusive, effective 2025-09-22 (verify, A2) |
| 2026-11-07 | S0: promo `value` is a percent for `pct` and paise for `flat` |
| 2026-11-07 | S0: staff and guest logins are separate Auth.js providers; sessions are JWT |
| 2026-11-07 | S0 fix: destructive DB scripts and integration tests go through `src/db/safety.ts`; tests need `TEST_DATABASE_URL` (separate Neon branch), no fallback |
| 2026-11-07 | S0 fix: gated server components call `await connection()` before `auth()` (Auth.js uses `crypto.getRandomValues()`, which cacheComponents rejects while prerendering) |
| 2026-11-07 | S0 fix: `--accent-foreground` token (white) for text on accent; loading buttons keep full opacity |

## S0 summary (Aditya Pawar, 2026-11-07)

**What works**
1. Frozen contracts and fixtures for pricing, inventory, booking, enquiries, ai-router (plus read-only catalog); stubs return fixtures; `quoteHash` implemented and tested.
2. Drizzle schema, one migration, all CHECKs and indexes from `03`, applied to the Neon `development` branch. Idempotent seed (`pnpm db:reset && pnpm db:seed`).
3. Auth.js credentials for guests and staff, `requireRole()`, `requireGuestOwner()`, sign up with consent, route protection.
4. UI kit, guest, staff and auth shells, hidden review page at `/dev/ui` (screenshot in `docs/screenshots/F7.png`).
5. CI workflow (typecheck, lint, format, unit, build, Postgres integration). TDD notes started.
6. Last run: typecheck, lint, format check, 31 unit tests, 13 integration tests and build all pass. The development branch was re-seeded after the final test run.

**How to verify**
1. `pnpm install`, make sure `.env.local` has `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, and for integration tests `TEST_DATABASE_URL` (separate Neon branch).
2. `pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration`.
3. `pnpm dev`, open `/dev/ui`, `/login`, `/admin/login`. Demo logins are in `README.md` (password `Demo@12345`).

**Open questions for the scrum master**
1. F6 (deploy) is untouched, as agreed. Production DB credentials were never used; `.env.local` holds only the `development` branch and is git ignored.
2. GST slab values and the inclusive boundary at Rs 7,500 need confirming before go-live (A2). Also confirm that `value` is paise for flat promos.
3. `03` lists no index on FK columns such as `payments.booking_id` or `booking_events.booking_id`; I added none to stay exact. Say if you want them.
4. CI has not run on GitHub (nothing pushed). First push will show whether `pnpm/action-setup` accepts the `packageManager` pin.
5. `acquireHold` takes `{ stay, quoteHash, guestId }` and returns the full `Booking`; `confirmPayment` returns `REFUND_PENDING` as an ok outcome. Both are documented in `01` (Contract notes) and need your sign-off since contracts are frozen.
6. Mobile (375px) audit of `/dev/ui` is left to H4; the headless screenshot tooling could not emulate that width reliably.
7. Auth rate limiting and security headers are deferred to H2.

## S0 fixes (Aditya Pawar, 2026-11-07)
1. Database safety: `src/db/safety.ts` (`assertSafeDestructiveTarget`, `childEnvForTests`) guards seed, reset and the integration helpers. Fails closed on a missing URL, a host in `DB_PROTECTED_HOSTS`, `NODE_ENV=production`, or a test URL on the same host as `DATABASE_URL*` (Neon `-pooler` suffix ignored). Tests use `TEST_DATABASE_URL` only; the seed child gets `DB_TARGET=test`. CI sets only `TEST_DATABASE_URL`. 11 new unit tests.
2. `/account` and `/admin` no longer crash in dev: `await connection()` before `auth()`.
3. Primary button text uses the `--accent-foreground` token (white, 9.7:1 on accent); loading state no longer dimmed. 2 new token tests.
4. Not run (by instruction): `test:integration`, seed, reset, migrations. Integration tests and the new CI env are therefore unverified against a real database.

## Attribution update
1. 2026-11-07: Author and ownership attributions standardized to Aditya Pawar at the project owner's request.
