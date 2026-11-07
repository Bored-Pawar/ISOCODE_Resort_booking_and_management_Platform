# 06 Progress

Scrum master: Aditya Pawar. Deadline: 9 Nov 2026, 23:59 IST.
Developers update this file after significant changes. Keep entries one line.

## Ownership of locked areas
Coordination records, not enforcement. The scrum master assigns ownership in chat; developers confirm before editing. Pull `main` before reading this table.

| Area | Paths | Owner | Since |
|---|---|---|---|
| Database schema, migrations and seed | `src/db/**` | Codex (S1; exclusive coordination lock, only B1–B5-required changes) | 2026-11-08 |
| Booking and inventory core | `src/modules/{inventory,booking,payments}/**` | Codex (S1; B1–B5, not B7 gateway) | 2026-11-08 |
| Pricing engine | `src/modules/pricing/**` | Codex (S1; B1 and transaction helper) | 2026-11-08 |
| Guest browsing and catalog | `src/app/(guest)/**`, `src/modules/catalog/**` and guest-screen-local components | Claude Code (S1; G1–G3) | 2026-11-08 |

## Current sprint
S1: Codex builds the real B1–B5 booking backbone while Claude Code builds G1–G3 guest screens against frozen contracts and fixtures.
Goal: booking backbone real + guest screens on fixtures; merge B1/B2 early so guest screens can switch to real pricing and availability before B3–B5 finish. S0 history and unfinished F6 remain recorded below.

## S1 coordinated start (2026-11-08)
- Codex: B1–B5 in an isolated worktree, based on the agreed common commit containing S0 review fixes. Sole editor of `src/db/**`, `src/modules/pricing/**`, `src/modules/inventory/**`, `src/modules/booking/**`, and `src/modules/payments/**` until this lock is released; no unrelated database changes or B7 mock gateway.
- Claude Code: G1–G3 on the same agreed base, separate worktree; consume frozen `pricing`, `inventory` and `catalog` public contracts and corrected fixtures. No edits to Codex-locked paths, including seed or payment files.
- Shared infrastructure, auth, `src/components/ui/**`, routes outside assigned features, and documentation require coordination before overlapping edits. B6/B7 and administrative rate/allotment editors are not part of this initial parallel assignment.
- Codex S0 reviews are retained **unchanged as dated evidence**; R01–R05 resolution is recorded in the existing follow-up below. Confirm fixes exist in the starting Git commit before implementation.
- For complete instructions and test gates see `docs/s1-codex-handoff.md`. Git base SHA and actual confirmation of both locks must be recorded by the developers before edits. Do not treat this proposed assignment as proof that either developer confirmed it.
- Next after G1–G3: Claude Code takes Q1–Q3 (enquiry backend and UI). R1–R2 go to whichever developer becomes available first, after explicit ownership assignment; they are not part of current B1–B5 or G1–G3 scope.
- Review ownership: Claude Code (Opus) independently reviews B1–B5; Codex independently reviews G1–G3. Neither implementation owner self-approves a merge.
- Integration: submit and review B1+B2 as an early PR; merge when green rather than waiting for B3–B5. Claude may then switch G1–G3 from fixtures to the real public services.
- Progress-file coordination: each developer edits only their own `06-progress.md` rows; otherwise report updates to the scrum master for application on `main`. Avoid simultaneous edits to the shared table.
- Scrum master name: retained as **Aditya Pawar** from the supplied project documentation; verify separately if the actual responsible person differs, before changing attribution.

## Codex S1 execution (2026-11-08)
- Codex B3 continuation: starting clean at reviewed `2813989`, verified current `origin/main` ownership (PR #4 merged at `7d5a356`) without merging/rebasing this branch; renewed B3–B5 assignment authorises implementation/testing/local commits only, with no push/PR/merge. Reviewed B1/B2 fixes remain intact and the isolated test endpoint passed a fresh guarded read-only preflight.
- Codex B3 implementation: one hold transaction performs scoped expiry, ordered inventory locking, pricing/hash recheck, frozen booking/night/event inserts and one retry for `40P01`/`40001`; typed failures roll back even initial expiry. The guest action derives identity through `requireRole('guest')`; persisted booking reads enforce the supplied verified actor's ownership. Expiry prelocks the union of released/requested nights and inventory deltas are batched after ordered locks.
- Codex B3 targeted proof: all 13 new real PostgreSQL hold tests passed (193.81 s), including exactly one success among 20 parallel last-unit requests, overlapping multi-night races, SQL rollback faults and both transaction retry codes; typecheck and unit tests passed before the local milestone commit.
- Codex M0: confirmed B1–B5 ownership from the scrum master's pasted assignment; clean isolated `resort-codex` / `codex/dev` at `bf62c90`, fetched `origin/main` (`e506cfd`) already incorporated; R01–R05 fixes verified in ancestry and source; baseline typecheck/lint, 68 unit and 13 PostgreSQL integration tests passed; guarded test endpoint verified distinct from development before writes.
- Codex B1: database-backed public/transaction quotes share pricing-owned nightly calculation with seed snapshots; R09 capped flat discounts redistributed; nightly effective GST, promo validity/usage, occupancy, totals and deterministic hash covered; public contracts and schema unchanged; Claude Opus review approved with required fixes, tracked below.
- Codex B2: database availability and ordered nightly locks respect missing stock, website allotment and inclusive blackouts; lazy expiry requires the early B3/B4 adjustment/helper/public-wrapper prerequisite, included here with atomic audit events and concurrent double-release coverage; cron, atomic acquisition and payment confirmation remain B3–B5 work.
- Codex integration: hidden `/dev/ui` passes its quote fixture from the server to avoid importing the new database-backed pricing barrel into the browser; Claude's G1–G3 paths and catalog are untouched; fixture IDs remain demo-only until Claude's catalog uses database UUIDs.
- Codex B1+B2 verification: typecheck, lint, 67 unit tests, 26 real PostgreSQL integration tests and build passed; all-file Prettier check passes with `--end-of-line auto`, while raw `format:check` flags existing Windows CRLF checkouts; test database alone was migrated/reseeded, development was untouched; mandatory expiry/GST tests covered, full nine-test gate awaits B3–B5.
- Codex review fixes: authoritative report `docs/resort-review-b1-b2.md` retained unchanged; availability now calls a booking-owned internal wrapper with mandatory date range and optional room UUID, keeping the public site-wide sweep for cron/maintenance; no public contract/schema changes and no B3–B5 implementation started.
- Codex review tests: added room/range exclusion including checkout boundaries, injected `now` equality and +1 ms expiry, all-room availability, invalid/unknown room filters and isolation from corrupt expired holds outside the request; lowercase-stored promo lookup also covered against PostgreSQL.
- Codex quick minors: promo lookup compares uppercase on both sides; inventory/expiry predicates compare validated UUIDs without casting indexed columns to text; reviewed BOMs removed; pure seed/test pricing imports and the scoped availability-to-booking internal import are documented in `01`/`02`; dated S0 report/handover restored to `main` content to remove unrelated attribution edits from this PR while retaining Git history; shared `/dev/ui` fixture-prop fix retained as accepted by review.
- Codex remaining minors: promo validity still means the whole stay-night window (unchanged reviewed behavior); scrum master to clarify stay validity versus booking-date validity before A4. Date-range caps narrow frozen schemas and need approval. A4 must normalise promo codes and prevent case-only duplicates; existing ambiguous stored duplicates fail rather than choosing a promotion arbitrarily.
- Codex deferred performance/integration: Codex B3/B4 owns batching ordered inventory writes after the concurrency gate (current per-night updates retained); Claude G1–G3 must use DB UUIDs, keep service values out of client bundles and make availability request-time (`connection()`/`Suspense`). No development reseed performed; historical snapshots stay frozen. Hold-lock/rate-edit races and accepted promo-usage overshoot remain later-story tests.
- Codex review-fix proof: fresh guarded read-only preflight verified the separate test endpoint (PostgreSQL 18.6); typecheck, lint, all 67 unit tests, all 32 real PostgreSQL integration tests and build passed. Whole-repository Prettier check passes with `--end-of-line auto`; existing Windows CRLF checkout limitation remains. PR is prepared directly from `codex/dev`, preserving reviewed commits/history; B3–B5 wait for the scrum master's next instruction and no merge is authorised.

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
No outstanding image blocker: the `public/images/*` assets have been supplied. Any new blocker must be logged when discovered.

## Decisions log
| Date | Decision |
|---|---|
| 2026-11-08 | B1 GST schedules are complete sets grouped by `effective_from`: use the latest schedule effective on each stay night, after allocated discount, with inclusive bounds and no fallback to older schedules. A missing matching slab returns `NO_RATE`; A6 must validate and save each complete, non-overlapping schedule atomically. This documents the reviewed implementation, without changing tax values or public contracts. |
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

## Codex S0 review follow-up (2026-11-07)
Reports: `docs/s0-review-codex.md`, `docs/s0-feature-map.md`.

**Fixed in S0:** R01 design in `01` "Contracts" plus internal helper stubs; R02 hold error codes; R03 migrate uses the same guarded target as reset and seed; R04 protected-host fragments normalised; R05 coherent stub quote and hold. Tests: 62 unit.

**Deferred (log only)**
| ID | Issue | Story | When |
|---|---|---|---|
| R04 (rest) | Opt-in protection only. Add an explicit disposable-target allowlist and operator-side production protection | F6, H2 | before F6 credentials exist |
| R06 | `DataGrid` blur cancels the editor while an async commit is pending; a thrown commit callback is uncaught | A1, A2 | when the grids are wired |
| R07 | `HoldTimer` resets its once-only guard when `onExpire` identity changes, so expiry can fire twice. Track by target timestamp | B6 | before B6 |
| R08 | `classificationSchema` accepts garbage dates, reversed ranges, negative counts and budgets; route rejects to fallback | R3 | with R3 |
| R09 | `seed/pricing.ts` `nightDiscounts` loses unused flat discount when a night is capped (rates [100,1000], value 600 gives 400). Do not copy into B1 unchanged | B1 | must be fixed when pricing is centralised |

**Approved contract decisions**
1. `booking.acquireHold({ stay, quoteHash, guestId })`: `guestId` comes from the server session only, never from client input.
2. `confirmPayment` outcome `REFUND_PENDING` means the payment was handled (recorded for refund) and the booking is not confirmed. UI branches on `outcome`.
3. The `catalog` module is kept (read-only addition to the C1 list).
4. Additive: `booking.releaseExpiredHolds()` (stub) for cron and lazy expiry; internal tx helpers are not part of the public contract.

**Note for F6:** `db:migrate` now refuses `NODE_ENV=production` and needs `DATABASE_URL_UNPOOLED`. Production migration needs its own explicit, reviewed step.

## Worktree sync (2026-11-08)
1. Aditya Pawar: merged `claude/dev` at `23c0b10` into `codex/dev`, preserving the review reports and document attributions; typecheck and 68 unit tests pass; R04 allowlist and R06-R09 remain deferred as recorded above. No integration tests or database scripts run.
