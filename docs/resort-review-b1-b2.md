# Review: Codex B1 (pricing) + B2 (availability)

Reviewer: Claude Code (Opus). Date: 2026-11-08. Target: `codex/dev` @ `5c93971`
(detached checkout `../resort-review`). Base: `main` @ `e506cfd`. Codex worktree was clean.

## Verdict: APPROVE WITH FIXES

No blockers. No public contract changes. The pricing core is shared and correct, and R09 is fixed.
The lock path is correct. Fix the two majors before merge, or log them with an owner. The minors can be follow-ups.

## Gate results (run in ../resort-review)
| Gate | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm format:check` | FAIL, 118 files, all line endings: local `core.autocrlf=true` gives CRLF. `prettier --check --end-of-line auto .` passes. Not caused by the branch; CI on Linux checks out LF. |
| `pnpm test` (unit) | pass, 12 files, 67 tests |
| `pnpm build` | pass |
| `pnpm test:integration` | NOT RUN (it uses the shared test DB, so it needs your approval). Codex reports 26 passing. |

## Contracts and locks
- `git diff main...5c93971 -- src/modules/*/index.ts src/modules/*/types.ts`: no signature or result-union changes.
  `types.ts` is untouched. `pricing/index.ts`, `inventory/index.ts` and `booking/index.ts` swap stub bodies for DB calls.
  `booking.releaseExpiredHolds()` is now real. That is the approved additive entry, pulled forward under the 01 S1 sequencing note.
- Import graph matches 01: `inventory/index -> booking/index -> booking/internal -> inventory/internal`. No cycle.
- Paths outside the allowed set: `src/app/dev/ui/{page,showcase}.tsx` (the fixture is now passed from the server), and
  `docs/s0-handover.md` and `docs/s0-review-codex.md` (author rename from merge `d81ae50`). Both are listed as minor findings below.

## Findings
| Sev | file:line | Issue | Suggested fix |
|---|---|---|---|
| major | src/modules/inventory/index.ts:39 | `availability()` calls the unscoped global `booking.releaseExpiredHolds()`. Every public read (guest search, each date change) opens a write transaction over all expired holds in every room type. Bad data on any room (e.g. a `held` CHECK violation) then breaks availability for the whole site. 01 says release should be scoped to the request ("for this room type and date range"). | Call a scoped release with `{ roomTypeId?, checkIn, checkOut }`. The contract is frozen, so do it through an internal path, or get approval for an optional scope argument. Keep the unscoped call for cron only. |
| major | tests/integration/inventory.test.ts (missing) | The lazy-expiry paths that B3 and B4 rely on are untested: scoped release (`roomTypeId`/`checkIn`/`checkOut` filters at booking/internal.ts:42-44), the `now` override, and equality at the boundary (`hold_expires_at = now`, which 01 S1 note 3 asks for). `availability()` without `roomTypeId` (the main path for guest screens) is also untested. | Add tests: a booking outside the scope is not released; `hold_expires_at = now` is released; the no-room query returns every room, with the test room's values correct. |
| minor | src/modules/pricing/calculation.ts:15-30 | Undocumented decision: each `effective_from` must define a complete slab schedule, and older schedules are never used as a fallback. If A6 adds one slab with a new date, every later night throws `MissingTaxSlab`, so every quote returns `NO_RATE`. | Record this in 01/03 and enforce it in A6 (always save the full schedule). Alternatively, ask the scrum master for per-slab fallback. |
| minor | src/modules/pricing/read.ts:57-64 | Promo validity is checked against the stay nights (`validFrom <= checkIn`, `validTo >= last night`), not the booking date. 01 only says "validity". | Get a scrum master decision and record it in 01. |
| minor | src/modules/pricing/read.ts:43 | Promo lookup uppercases the input but compares it to `c.code` as stored. A lowercase code entered later in A4 would never match. | Use `upper(c.code) = upper($1)`, or normalise and CHECK the stored code to uppercase. |
| minor | src/modules/inventory/internal.ts:80 | `adjustNights` runs one UPDATE per night, and expiry (booking/internal.ts:58-66) calls it once per (room, night). A long stay or a big cron batch means N round trips. | After `lockNights` (rows already locked), use one `UPDATE ... FROM unnest(...)`. For expiry, first lock with one ordered `SELECT ... FOR UPDATE`, then one UPDATE. |
| minor | src/modules/booking/internal.ts:42, src/modules/inventory/read.ts:26 | `room_type_id::text = $1` stops index use on `room_type_id`. | Check the value as a UUID in TS (non-UUID gives an empty result), then compare `= $1::uuid`. |
| minor | src/modules/inventory/index.ts:14-22 | No upper bound on the range, so a 10-year request is accepted (still one query, but a large scan). Same for quote nights. | Cap it (e.g. 30 nights for a stay, 180 for a calendar). This narrows the frozen schema, so it needs approval. |
| minor | src/modules/pricing/index.ts:1, internal.ts:1, src/db/seed/pricing.ts:1, tests/unit/stub-coherence.test.ts:1 | Files start with a UTF-8 BOM. | Save without the BOM. |
| minor | src/db/seed/pricing.ts:1 | The seed deep-imports `@/modules/pricing/calculation` (as do tests), not the module's `index.ts`. That is fine for a pure helper, but it is an undocumented exception to rule 4. | Note the exception in 01 "Contracts", or re-export `calculateQuote` from `pricing/index.ts`. |
| minor | docs/s0-review-codex.md:1, docs/s0-handover.md:37 | The handoff calls these "unaltered historical evidence". The rename turns the title of Codex's independent review into "Aditya Pawar", so the record no longer shows who reviewed. | Scrum master to confirm the rename was intended for review reports, or revert the title only. |
| minor | src/app/dev/ui/page.tsx:4 | Edited outside Codex's lock (shared dev page). The reason is sound: the `pricing` barrel now pulls in `getDb`. | Accept. See the client-bundle risk below. |

## Verified OK (checked in code)
- One pure computation: `calculateQuote` (calculation.ts:79) is used by `pricing.quote` and `quoteInTx` (both through `readQuote`), and by the seed (seed/index.ts:228).
- Integer paise only: `applyBp` rounds half up per night; there is no float money.
- GST is chosen per night on `rate - discount` (calculation.ts:67) from the latest `effective_from <= date`. Bounds are inclusive: 750000 gives 5%, 750001 gives 18% (unit and integration tests).
- R09: rates [100,1000] with flat 600 give [100,500], total discount 600 (unit test plus integration test at pricing.test.ts). A property test checks that the discount is conserved and that no night goes negative.
- `NO_RATE` covers a missing night, an inactive or mismatched plan, an unknown room or a non-UUID ID, and a missing slab. Occupancy is checked against adults and children. Promo checks cover active, window, min nights and `used_count >= max_uses`.
- Seed snapshots: the integration seed test recomputes every seeded booking through `calculateQuote` and checks the nights, totals and `quote_hash` against what the seed stored.
- `lockNights` (inventory/internal.ts:36-61) is one `SELECT ... ORDER BY date FOR UPDATE`. It returns `SOLD_OUT` on a row-count mismatch or a short night, and `BLACKOUT` for room-level or all-rooms blackouts (end date inclusive, checkout excluded). It takes the caller's `tx` and never opens or commits a transaction.
- `readAvailability` is one grouped query (no N+1 over 180 days). Missing rows give 0, not an omitted room.
- Expiry: the conditional UPDATE uses `FOR UPDATE SKIP LOCKED` plus `AND status='HELD'`. Inventory deltas are aggregated and applied in sorted (room, date) order, with events in the same transaction. The concurrent double-release test is present (mandatory test 3).

## Tests: what exists and what it proves
- Unit `calculation.test.ts`: R09 table and property test, GST boundary, per-night effective schedule, hash determinism. All pure logic, no mocks.
- Integration `pricing.test.ts`, `inventory.test.ts`, `seed.test.ts`: real Postgres. Each test owns its rows (UUID tag, year 2099, cleaned up afterwards). `getDb` is spied to the test pool, so the code under test is the real module code, not a fixture.
- Removed: S0 stub-success assertions in `contracts.test.ts` and `stub-coherence.test.ts`, which were correctly superseded. What remains are boundary checks that need no DB, plus the fixture-consistency tests.
- None of the B1/B2 tests checks only fixtures or mocks.

## Untested risks
1. Integration suite not re-run by the reviewer. Pass status is Codex's claim only, pending your go-ahead.
2. No test proves `lockNights` actually blocks a concurrent locker. That proof (20 parallel holds) lands with B3 test 1.
3. Client bundle: `@/modules/pricing` and `@/modules/inventory` now import `getDb`. Any `"use client"` G1-G3 file that imports a value (`quoteFixture`, a schema) from these barrels will break the build or leak server code. Use `import type`, or pass the value from the server.
4. Server rendering: `availability()` writes (expiry UPDATE). G1-G3 server components must call it after `await connection()` or inside `<Suspense>`, or `cacheComponents` prerendering may hit the DB or fail at build time.
5. Fixture IDs (`rt-...`) are not UUIDs. The real `quote` returns `NO_RATE` for them and `availability` returns `[]`. G1-G3 must switch to DB UUIDs at the same time.
6. The dev DB was seeded with the old (pre-R09) algorithm. Its snapshots stay valid, because they are frozen, but they differ from what `calculateQuote` gives now. Reseed dev after merge if the seed test is ever pointed at it.
7. A `quote()` that races a concurrent rate edit inside `acquireHold` runs at READ COMMITTED. That is acceptable (the hash recheck catches it), but it is not tested until B3 test 9.
8. Concurrent promo overshoot past `max_uses` is accepted and documented as a known limit in 01. It is not tested.
