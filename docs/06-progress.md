# 06 Progress

Scrum master: Aditya Pawar. Deadline: 9 Nov 2026, 23:59 IST.
Developers update this file after significant changes. Keep entries one line.

## Codex R1–R4 audit remediation (2026-11-08)
- Phase 0: switched benchmark worktree to assigned `codex/r1-r4-ai-routing` at identical reviewed `39d168f`; all original dirty/untracked benchmark files preserved separately in `0f2ce67`. No merge/rebase/push; `origin/main` merge base remains `e1e3d92`. Audit copied byte-for-byte from detached audit worktree (SHA256 `3f46f2a33423366b77c1ab16d3f3472ff9fa740b4cc9c4cc331312cd93d64bfc`); actual scheduling/backlog path is `docs/07-backlog.md`.
- B1: pure original-text grounding gates quote selection and final draft substitution, retains classification/routing, persists evidence and labels trusted quote basis/omitted children; 347 unit tests pass, including unsupported-input pricing spies and template-bypass regressions. No database calls or protected source edits.

## Codex R1–R4 Ollama benchmark (2026-11-08)
- Isolated branch `codex/r1-r4-ollama-benchmark` at implementation base `39d168f`; fetched main remains `e1e3d92`. Original 30-case/model ten-second baseline and interrupted controlled evidence preserved; Ollama 0.40.15 and both Q4_K_M model digests verified on RTX 4050/6141 MiB. No database calls, paid providers, model downloads or sends.
- Complete: 439 live chat attempts (387 completed operations, retries and one user interruption), 30 cases with three controlled passes/model plus two 12-case architecture experiments; raw/schema/application/quality/GPU evidence audited. Recommendation C: improve single call with Qwen3 4B locally; no architecture change implemented. Typecheck, scoped lint and 321 unit tests pass. Only authorized production change is local timeout 30 minutes versus hosted 10 seconds; no DB access. Report: `docs/reviews/r1-r4-ollama-model-benchmark.md`.

## Codex S2 R1–R4 (2026-11-08)
- M0: fetched `origin/main`; base `e1e3d92d80ccfa6b2e89dd4fd23166bde11ba944` already equals `codex/dev`, including B10/stay builder; isolated Codex worktree now uses `codex/r1-r4-ai-routing`. Scrum master's final handoff assigns ai-provider, ai-router and R2 enquiry internals; other modules/schema stay read-only. User-supplied untracked final handoff preserved.
- M0 gates: baseline typecheck/lint, 232 unit tests and production build pass (tests/build require subprocess permission on Windows); read-only repository safety guard verified isolated TEST_DATABASE_URL and PostgreSQL 18.6 before writes. No hosted provider keys/local endpoint configured; Ollama executable absent. No live-model results claimed.
- M1: AI SDK 7.0.164 shared `generateText`/`Output.object` transport supports Google, Anthropic, OpenAI-compatible local and zero-call rules; 10-second abort per attempt, one bounded transient retry, sanitized errors. Typecheck and all 244 unit tests pass; no live smoke possible without configured provider. Local model installation is deferred as instructed.

- M2 persistence: all 9 isolated PostgreSQL queue tests pass, covering concurrent claims, stale generation, recovery, batch five, atomic rollback on draft/notification failure, duplicate settle, metadata merge and human changes. Failed persistence retains a recoverable processing row; staff intervention cancels the generation with `STAFF_CHANGED`. No migration or schema change.
- M3: validated dates/party/budget, redacted provider input, single-call classification/draft response, conservative rules and deterministic role routing implemented; 15 focused classifier/routing/PII cases pass. Working-tree typecheck and 291 unit tests pass, including forthcoming R4 checks. Public response/type shapes remain unchanged; R08 validation is tightened as explicitly assigned.
- M4 implementation: public process now claims/classifies/quotes/settles real rows; ingestion and list register batch-five `after()` recovery; inbound build manifest confirms 60-second route duration. Matching EP room/cart selection respects named villas, explicit room count and stock; prose guard/template preserves model `ok`, stores real quote/GST and never approves/sends. Typecheck and 297 unit tests pass; dedicated intake-to-draft PG cases are prepared and awaiting the broad regression run's completion.
- M5 evaluation: `pnpm eval:ai --smoke` and `pnpm eval:ai` executed in configured rules-only mode, 5/5 and 30/30 labels matched; all results fallback/unsorted. Evidence JSON explicitly sets live-model accuracy, schema/draft validity and latency to null. No real API calls, quota/429 inference, model installation or database writes occurred. Full regression still running; no merge readiness or independent review approval claimed.
- M5 regression follow-up: first broad PG run was 60 passed/15 failed/9 skipped (1593.55 s), with stale overlapping 2099 GST fixtures plus 10/30-second hook/test timeouts; read-only follow-up found no duplicate slabs. Focused PG proved critical villa's real quote/GST and found a named-room prefix broadening bug, now fixed with a unit regression. Explicit test hook budgets and an optional serial remote-PG profile retain assertions; final reruns are in progress. See `evidence/ai-postgres-first-regression.md`.

- M5 final gates: typecheck/lint, 299 unit tests in 41 files, production build and changed-source formatting pass; 21/21 focused PG cases pass (244.55 s), and all 24 affected existing regressions pass unchanged (566.12 s; 27 intentionally deselected). Across the initial passing cases and reruns, all 95 unique PG cases have a passing observation; the original broad command remains recorded as failed. Final main fetch still equals base `e1e3d92`; no protected source/UI diff, public signature change, push, PR, independent approval, merge or deployment. Review handoff: `s2-r1-r4-implementation-handoff.md`.

## Ownership of locked areas
S2 R1–R4 assignment supersedes the historical S1 enquiry lock only for R2 internals: Codex owns `ai-provider`, `ai-router` and R2 enquiry processing internals on `codex/r1-r4-ai-routing`. Other locks are unchanged; no Q4–Q7 screens or database/booking edits are authorized here.
Coordination records, not enforcement. The scrum master assigns ownership in chat; developers confirm before editing. Pull `main` before reading this table.

| Area | Paths | Owner | Since |
|---|---|---|---|
| Database schema, migrations and seed | `src/db/**` | Codex (S1; exclusive coordination lock, only B1–B5-required changes) | 2026-11-08 |
| Booking and inventory core | `src/modules/{inventory,booking,payments}/**` | Codex (S1; B1–B5, not B7 gateway) | 2026-11-08 |
| Pricing engine | `src/modules/pricing/**` | Codex (S1; B1 and transaction helper) | 2026-11-08 |
| Guest browsing and catalog | `src/app/(guest)/**`, `src/modules/catalog/**` and guest-screen-local components | Claude Code (S1; G1–G3) | 2026-11-08 |
| Enquiry intake and dev area | `src/modules/enquiries/**`, `src/app/api/inbound/**`, `src/app/dev/**`, `src/app/(guest)/(site)/enquire/**`, `src/lib/auth/{password-field,sign-up-schema}*` | Claude Code (S1; Q1–Q3, dev area, password UX) | 2026-11-08 |

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
- Codex B4 implementation: site-wide expiry remains the public maintenance sweep and availability retains the reviewed room/date scope; expiry workers use `SKIP LOCKED`, conditional state changes, ordered batch stock release and transactional events. `/api/cron/expire-holds` validates input and requires `CRON_SECRET` bearer authentication (machine endpoint per explicit B4 assignment, not a user-session role); missing configuration/credentials fail closed. `vercel.json` schedules a daily 00:00 UTC / 05:30 IST sweep; no deployment was performed.
- Codex B4 targeted proof: the combined 28-test PostgreSQL lifecycle suite passed (491.58 s), including locked expiry rows, overlapping batch release, longer-stay reacquisition races and audit rollback; cron authentication unit tests and production build pass. The complete existing-plus-new integration regression gate is running before final handoff.
- Codex B5 implementation: payment amounts are checked only against saved totals; targeted booking expiry and one conditional HELD transition precede payment/stock writes. Provider-ID duplicates replay their saved success/refund outcome; mismatched reuse rolls the whole transaction back. EXPIRED/CANCELLED stay terminal and extra distinct charges are refund-pending. Confirmation rechecks the database clock after obtaining the booking write lock and rolls back/retries if a wait crossed expiry; state, payment, inventory, audit and first-confirmation promo usage commit together.
- Codex retained limits: promo-use overshoot remains the approved policy; stay-window promo validity/range caps remain the recorded follow-ups. The frozen positive-payment schema has no zero-total/free-stay confirmation path, so enabling such promotions requires a separate policy/contract decision. B7 must authenticate provider callbacks and B6 must use the verified-session action; no gateway, guest UI or deployment is included here.
- Codex B3–B5 final proof: complete PostgreSQL integration gate passed 60/60 tests across 6 files (744.98 s), including all nine mandatory cases; after final UUID comparison normalization, the 2 affected ownership/duplicate-replay cases passed again (58.23 s). Typecheck, lint, 74 unit tests across 15 files and production build pass. Inventory reconciliation and SQL fault/clock/race assertions passed; development/production databases were untouched.
- Codex B3–B5 handoff: `docs/s1-b3-b5-handoff.md` maps the nine required outcomes, implementation boundaries and review focus. AST comparison confirmed frozen booking types/schemas/service signatures match reviewed `2813989`; schema, migrations, guest/catalog and historical S0 documents have no diff. Raw format check still flags existing Windows CRLF checkout files; normalized whole-repository check passes. Local commits only: no push, PR, merge, rebase, reset or deployment performed for B3–B5.
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

## S1 guest screens (Claude Code)
| ID | Task | Status |
|---|---|---|
| G1 | Home, story blocks, date and guests search, URL params | done, awaiting review (screenshots in `docs/screenshots/`) |
| G2 | Available rooms with prices | done, awaiting review (real catalog, availability and quotes) |
| G3 | Room detail | done, awaiting review. Reserve links to `/book` (B6, not built yet); param contract proposed in `tdd-notes.md` |

## S1 enquiry intake (Claude Code)
| ID | Task | Status |
|---|---|---|
| Q1 | `enquiries.ingest()` and `list()` on PostgreSQL, `ai_status='pending'` saved first | done, awaiting review |
| Q2 | Guest enquiry form `/enquire`, prefill params, `mailto:` replaced on G1–G3 | done, awaiting review |
| Q3 | `/api/inbound/email` and `/api/inbound/whatsapp`, simulator at `/dev/test` | done, awaiting review. No AI call; rows stay `pending` until R1/R2 |
| Dev | `/dev` area behind `DEV_TOOLS_ENABLED`, `/dev/login`, staff-only pages | done, awaiting review |
| Auth UX | Confirm password on sign up, show/hide toggle on all four password forms | done, awaiting review |

## Done
1. Docs structure, backlog and design system.
2. S0 (except F6): scaffold, frozen contracts, schema, seed, auth, CI, UI kit, TDD notes. See the summary at the end of this file.

## Blockers
No outstanding image blocker: the `public/images/*` assets have been supplied. Any new blocker must be logged when discovered.

## Decisions log
| Date | Decision |
|---|---|
| 2026-11-08 | B10 approved: a booking is one order with 1 to 4 room lines (`booking_rooms`), one hold, one payment, one total. Supersedes the 2026-11-07 one-room-per-booking rule. Design: `s2-multiroom-change.md` |
| 2026-11-08 | Occupancy rule: `1 <= adults <= max_adults` and `adults + children <= max_occupancy`; `max_children` stays in the schema, not enforced |
| 2026-11-08 | S2 lock holder: Claude Code holds `src/db/**`, pricing, inventory, booking, payments, guest and catalog, on branch `claude/multiroom` only (overnight runbook); Codex idle |
| 2026-11-08 | B1 GST schedules are complete sets grouped by `effective_from`: use the latest schedule effective on each stay night, after allocated discount, with inclusive bounds and no fallback to older schedules. A missing matching slab returns `NO_RATE`; A6 must validate and save each complete, non-overlapping schedule atomically. This documents the reviewed implementation, without changing tax values or public contracts. |
| 2026-11-06 | Modular monolith on Next.js + TypeScript, Drizzle, Neon, Vercel |
| 2026-11-06 | Booking state machine and inventory rules per `01` |
| 2026-11-06 | AI default provider Gemini free tier; local and rules fallbacks |
| 2026-11-07 | Late payment after expiry: EXPIRED is final, payment REFUND_PENDING, no re-acquire |
| 2026-11-07 | ~~One room per booking in MVP (`units` column kept, validation enforces 1); groups go to enquiry~~ Superseded 2026-11-08 by B10 |
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

## Claude Code S1 Q1–Q3 (2026-11-08)
- Q1: `enquiries.ingest()` and `list()` are real; `ingestFrom()` and `list({ limit })` are additive (idempotency key, consent record, bounded list). Ids are `ENQ-XXXXX` from app code with retry on primary key conflict. No schema change. Needs sign-off: the webhook idempotency key lives in `extracted.source` (no column exists), so R3 must merge into `extracted`, never replace it.
- Q2/Q3/dev area/password UX verified in `pnpm dev`; see `tdd-notes.md`. `test:integration` not run, as instructed; the DB paths (`store.ts`) have no automated test yet and were checked by hand against the development database (test rows removed afterwards).

## Claude Code S2 B10 multi-room (overnight 2026-11-08, branch `claude/multiroom`)
- B10 built per `s2-multiroom-change.md` sections 1 to 6 on `claude/multiroom` (from `codex/dev` `c8c8b76` + `claude/dev` `da56069`); details and evidence in `s2-multiroom-handoff.md`. Not merged; see that file for the morning merge order.
- Development and test Neon branches were reset, migrated (`0001`) and reseeded through the guarded scripts; production untouched.
- Mandatory test 6 (allotment cut below committed is rejected) is **provisional until A2**: today it proves the database CHECK and the conditional update only; the A2 allotment editor must re-prove it through its own entry point (minor fix 4).
- Known limit (minor fix 5): the lazy and cron expiry sweep is one statement over every matching expired hold, not batched. Fine at seed scale; batch it before real traffic.
- Codex review of HEAD `370fd34` (APPROVE WITH FIXES) fixed on the branch, one commit each: F1 `/dev/test` simulator calls the inbound handlers in-process (no request-derived URL); F2 `typecheck` runs `next typegen` first, proven on a fresh clone; F3 search counts are no longer clamped (valid party: up to 24 guests that fit 4 rooms of any mix, else message plus enquiry link with the requested counts); F4 enquiry contact must be a valid email or a phone with 10+ digits (form and ingest); F5 `NO_RATE` from a missing tax slab carries `lineIndex`; F6 prefilled `/enquire` link wherever stock cannot fit the party.
- B6 steps 2 and 3 (details, hold, pay) are next; `/book/details` is a placeholder and takes no hold.

| ID | Task | Status |
|---|---|---|
| B10 | Multi-room bookings, occupancy rule, `/book` room cart (B6 step 1) | done on `claude/multiroom`, awaiting review and merge |

## Claude Code stay builder (2026-11-08, branch `claude/stay-builder`, stacked on `claude/multiroom`)
- Guest flow redesign per the scrum master's stay-builder brief: `/rooms` is the stay builder (room type cards with fresh "N left", Your stay lines, sticky summary with still-to-place counter and live quote, suggest button, enquiry links with `rooms`); `/book` redirects to `/rooms` with its params; room detail is view only (party capped to the room, one-room price, Add to my stay, Check availability). Details in `tdd-notes.md`.
- Header: Sign in returns to the current page (`next`); signed-in profile menu with My stay badge, My bookings, Sign out. `/account` lists bookings through the new additive read-only `booking.listForGuest` (approved in the brief; recorded in `01`), with a PostgreSQL test. No other booking, pricing, inventory, schema or contract change.
- Gates: typecheck, lint, 227 unit tests, build pass; `booking-list` integration test passes on `TEST_DATABASE_URL` (other integration files not run). Raw `format:check` still flags the same 12 pre-existing CRLF checkout files; `--end-of-line auto` passes.
- Open: the saved cart is cleared with `clearStoredStay()` once B6 steps 2 to 3 take a hold (not built). `/book/details` stays a placeholder.

| ID | Task | Status |
|---|---|---|
| SB | Stay builder, view-only room detail, header account menu, My bookings | done on `claude/stay-builder`, awaiting review |
