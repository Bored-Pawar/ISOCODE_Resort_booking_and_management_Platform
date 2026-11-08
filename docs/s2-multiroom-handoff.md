# S2 handoff: B10 multi-room (Claude Code, overnight 2026-11-08)

Branch `claude/multiroom` (pushed as a backup; no PR, no merge). Base: `codex/dev` `c8c8b76` merged with `claude/dev` `da56069` (clean merge, no conflicts). `claude/dev` had two untracked docs only (the change doc and this runbook); its last commit was used. The `codex/dev` worktree was clean at `c8c8b76`.

## Commits (on top of the merge)
`bd3b9ef` docs · `96b2d7c` contracts · `a1e156e` schema + migration `0001` + seed · `bfa9bab` pricing · `b9b61fe` inventory · `daf09a5` booking · `9402c22` G2/G3 · `e77c0d0` `/book` step 1 · `4aa59d0` docs + screenshots · `005fdf1` formatting · `2d2aaad` tests · `81be9f1` progress (review fix) · this handoff.
The contract commit `96b2d7c` does not typecheck on its own; every later commit was built in order and HEAD passes all gates.

## What works (evidence)
1. **Schema:** `booking_rooms` (line_no 1..4, adults >= 1, children >= 0, UNIQUE (booking_id, line_no), cascades), `booking_nights` keyed by `booking_room_id`, single-room columns dropped from `bookings`, `room_types.max_occupancy` with CHECK >= max_adults (3/4/5/6). The constraints are tested in `schema.test.ts`.
2. **Dev and test reset:** both reset, migrated and seeded through the guarded scripts on separate hosts: 30 bookings, 36 room lines, 5 multi-room. Production was not touched.
3. **Pricing:** GST per (line, night) cell; the flat promo is R09-allocated over cells in (line, date) order; totals are summed without re-rounding; the hash covers line order and excludes occupancy; `lineIndex` is set on `NO_RATE` and `OVER_OCCUPANCY`.
4. **Hold:** one ordered `FOR UPDATE` statement across all types, demand = lines per type, all or nothing; `SOLD_OUT` carries `roomTypeId`. Expiry and confirm adjust per type from `booking_rooms` x nights.
5. **Minor fixes:** one `CA-XXXXX` generator with a savepoint retry on 23505, used by hold and seed; the second `HoldElapsedWhileWaiting` now has a message; the cron exemption is recorded in `02`; test 6 is marked provisional and the unbatched sweep logged in `06`.
6. **UI:**
   - G2 and G3 price the whole party as 1 to 4 rooms of a type, never above the free stock, with "add another room" copy.
   - Reserve puts the cart in the URL in a stable order, at most 4 rooms.
   - `/book` edits the cart: type, plan, adults and children per line, a guests-left counter, per-line errors, and a live total per line and overall. Continue leads to the `/book/details` placeholder.
   - Checked in real Chrome at desktop and 375px, with no horizontal overflow. Screenshots are `docs/screenshots/b10-*.png`.

## Test counts (actually run on HEAD)
- Unit: **201 passed / 201** (28 files). Typecheck, lint and build pass.
- `format:check` with `--end-of-line auto` passes. The raw check flags untouched Windows CRLF checkouts, as on `codex/dev`.
- Integration (Neon test branch), **final run on `81be9f1`: 71 passed / 71, 7 files, 1158.7s, in a single run.** This covers the 9 mandatory tests as 1-line carts and the 8 new B10 tests.
- Baseline note: my integration baseline run was contaminated, because the new migration landed on disk mid-run and it failed closed on the populated test DB. The reference baseline is Codex's recorded 60/60 at `c8c8b76`.
- First full run: 70/71. New test 6 timed out at 38.9s against vitest's 30s default, a Neon latency issue, not a failed assertion. I raised the timeout for the B10 block to 120s, and the B10 file then passed 9/9 (328s).

## Deviations from the change doc (smallest safe fix, recorded)
1. **`Booking.nights` removed:** section 3 lists the removed single-room fields but not the order-level `nights`. With room lines the order-level list is ambiguous, so the nights live only in `Booking.rooms[].nights`, mirroring `Quote` (which has no top-level nights either).
2. **Migration `0001` hand-ordered:** drizzle-kit added the new `booking_nights` primary key before its column and prompts interactively on the column swap. I generated it in two passes, merged both into one `0001`, and ordered the statements by hand. The snapshot matches the schema: `db:generate` reports no changes.
3. **Section 7 work split:** the runbook gave all steps to Claude Code tonight, so there was no Codex `codex/multiroom` contract commit; the contract is commit `96b2d7c`.
4. **Reserve URL:**
   - It no longer carries `quoteHash`.
   - `/book` re-quotes on the server whenever the URL changes; there is no client fetch and no new public action.
   - B6 step 2 must hold with the hash of the quote shown on `/book`.
5. **Shared occupancy rule:** it lives in `src/lib/occupancy.ts` (pure), so pricing and the client cart share it without importing locked modules.

## Open items
1. B6 steps 2 and 3 (details, `acquireBookingHold` with the `/book` hash, pay); the `R07` HoldTimer fix is due before then.
2. Mobile `/book` shows the summary below the rooms plus a fixed total and Continue bar, rather than "collapsed at top" as `05` sketches for the steps.
3. `MissingTaxSlab` still returns `NO_RATE` without a `lineIndex`, since it is not a line fault.
4. The integration suite takes about 20 minutes on Neon; the B10 race tests alone take about 5 minutes.
5. The new test 1 deadlock check reads `pg_stat_database.deadlocks` after an 11s wait for stats to flush; it is reliable on a quiet test branch.
6. Mandatory test 6 stays provisional until A2. The expiry sweep is not batched (known limit).
7. The review subagent found no blockers. Its one major (the missing `06` notes) is fixed in `81be9f1`.

## Morning merge order (scrum master)
1. PR `codex/dev` (B3 to B5) into `main`, wait for CI to go green, merge.
2. Review this handoff, then PR `claude/multiroom` into `main` (it already contains `codex/dev` and `claude/dev`), wait for CI to go green, merge. The B10 migration needs a fresh database or the reset in `s2-multiroom-change.md` 2.5; there is no backfill.
3. Fallback if B10 is broken: keep `main` at B3 to B5 single-room and cherry-pick nothing. The cut-off is Sun 8 Nov 18:00 IST.
