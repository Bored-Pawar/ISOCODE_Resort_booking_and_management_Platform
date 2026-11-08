# S2 booking flow handoff (Claude Code, branch `claude/booking-flow`)

Runbook: `s2-booking-runbook.md` (updated mid-run with item 1b, the `/enquire` lock and A5 roles). Unattended run, 2026-11-08. Not merged; PR into `main` opened at the end.

## Preflight (Step 0)
- Worktree `resort-claude` was clean apart from the new runbook. `origin/main` = `e1e3d92` already contains `claude/multiroom` (B10) and `claude/stay-builder`, so the branch is cut from `origin/main` (no fallback).
- `pnpm install` up to date; Next.js 16.4.5 docs read from `node_modules/next/dist/docs/`.
- Baseline at `e1e3d92`: typecheck, lint, build pass; 232 unit tests in 34 files pass. Locks table in `06` updated.

## Commits (base `e1e3d92`)
`cb498f3` runbook and locks · `9c9b378` R07 HoldTimer · `70fca7a` runbook update · `625d89b` 1b three month window · `3f2c7c6` 2 promo · `ddbe5d6` 3 `/book/details` · `de44178` 4 `cancelHeld` · `8cb50e9` 5 pay step and mock gateway · `0e9a628` 6 confirmation, ics, email, outbox · `3d28bfc` 7 My bookings · `9cf3235` 8 A5 · `b7c3583` 9 Playwright · `6497d26` promo wording and screenshots · `8389bce` docs · `8e1d4f6` first review majors · `0dc08d1`, `4de6725` handoff.
Review fix round (`resort-review-booking-flow.md` at `8e1d4f6`): `808ba8c` remove a stray temp script · `a735fd6` M1 advisory lock and exact-stay reuse in `acquireHold` · `f69285c` drop the UI prechecks · `54c3257` M2 batched `listForGuest` · `33d9651` fixed clock in the pay tests · `4c44d69` race tests use distinct guests · this handoff.

## What works, with evidence
- **Gates (review fix round):** typecheck, lint, `format:check` (all files), 285 unit tests in 42 files run twice with no retry (the 2 `reusableHold` tests left with the helper; a double-submit test was added), `pnpm build`.
- **PostgreSQL (`TEST_DATABASE_URL`):** `cancel.test.ts` 6/6 (release once, cancel vs expiry both ways, cancel vs confirm one terminal state, non-owner FORBIDDEN, CONFIRMED is NOT_HELD), `staff-read.test.ts` 2/2, `booking-list.test.ts` 3/3. Full suite: see "Full integration run" below.
- **Playwright H1:** `E2E_BASE_URL=http://localhost:3100 pnpm test:e2e` passed (search, add room, Continue, inline sign up, hold, pay, confirmation ref) in 1.8 min against `pnpm dev` and the development DB.
- **Real Chrome checks (scripted Playwright, desktop and 375px), all passed:** promo invalid inline and applied; Continue carries `promo` and `quoteHash`; rate edited in the dev DB between page and submit gives PRICE_CHANGED with old and new total, "Continue at ₹x" holds; declined then succeeds confirms; `.ics` is `text/calendar` with an all-day event; email view; timeout then Check status; hold set to 100 s left shows the gate (Pay disabled, Refresh hold), a forced Pay click is refused by the server, Refresh hold cancels the old hold and takes a new one; Cancel from My bookings (dialog, toast, CANCELLED); last Pool Villa taken (allotment set to committed, then restored) sends the guest back to `/rooms` with the sold-out notice; three month window on `/rooms` and `/book/details`; a second guest gets the 404 screen for another guest's `/booking/[ref]` and `/book/pay/[ref]`, and a real 404 for the `.ics`; no horizontal overflow at 375px on details, pay, confirmation and My bookings. Screenshots `docs/screenshots/b6-*`, `b8-*`, `b9-*`. The rate and allotment edits were restored.
- **Codex review (`resort-review-booking-flow.md`, `8e1d4f6`):** M1 and M2 fixed per the scrum master's decisions; see "Review fix round" below.
- **Independent review (Step 2.3):** no blockers. Two majors, both fixed in `8e1d4f6`: (1) Refresh hold could take a second hold (two tabs or a replayed ref) and did not recheck the 2 minute rule: it now refuses while more than 2 minutes remain, and reuses an existing live hold for the same priced stay; (2) a late payment was only visible in the pay panel: `/booking/[ref]` and My bookings now show the `01` refund copy through the new read `refundPendingForGuest`.

## Review fix round
- **M1:** `acquireHold` starts with `pg_advisory_xact_lock(hashtextextended('hold:' || guestId, 0))`, then one query for a live hold of the same guest and exact stay (dates, `quote_hash`, identical lines in `line_no` order). A match returns it with no stock and no event. `holdStay` and `refreshHold` no longer call `listForGuest`. `01` (Lock order, Contract note 7) and `06` record it.
- **Query depth:** the hold precheck is 2 data queries before the old path (lock, lookup); a reuse hit adds the 3 + p snapshot read. `listForGuest` is 4 data queries for any limit (bookings, rooms, nights, promo codes), down from 1 + 3N + K. Test f measured 4 for 30 bookings through a counting client.
- **Tests (PostgreSQL):** `hold-idempotency.test.ts` a to e (5 parallel same-cart holds give 1 booking and held +1; a different party split gives 2 holds; 2 guests give 2 holds; an expired match is not reused; 2 parallel `refreshHold` calls cancel once and leave 1 replacement, reconciled) and `list-query-depth.test.ts` f.
- **Not changed (follow-up):** `payBooking` still reads the booking before and after the in-process webhook. The confirm outcome cannot reach the action without widening `PaymentProvider`.

## Deviations
- `promoCodesInTx(tx, ids)` was added to `pricing/internal.ts` (read only for this run) so promo codes load in one query; the alternative was booking reading `promo_codes` directly (rule 4).
- Three existing race tests assumed one guest could hold the same cart repeatedly (`booking.test.ts` mandatory 1 and the provider-ID reuse test, `multiroom.test.ts` new 2). Under Contract note 7 those holds are one booking, so they failed in the first full run (85/88). They now race between different guests (`coreFixture.otherGuest()`), which keeps testing the last-unit inventory race; the same-guest case is test a.
- The integration test for e runs the real `refreshHold` with the session, redirect and the 3 month window stubbed (the fixture dates are in 2099).
- `booking.refundPendingForGuest({ guestId })` is a further additive read (review major 2), beyond the two approved additions; recorded in `01`, needs sign-off.
- `getForStaff` and `listRefundPending` sit next to the approved `listForStaff` for the A5 detail and refund tab; recorded in `01`.
- A5 pages live at `src/app/(staff)/admin/(app)/bookings/**` (same URL `/admin/bookings`) so they get the staff shell; the nav item was added in `(staff)/admin/(app)/layout.tsx` (outside the listed locks), hidden for sales.
- Small edits outside the listed locks, all shared helpers: `src/lib/booking-window.ts` (item 1b), `src/lib/auth/{profile,sign-up-fields}.ts` and `phoneField` in `sign-up-schema.ts` (reuse for the details step, not a fork), `src/components/ui/hold-latch.ts`, `/dev/outbox` and its index entry, `.env.example`, `package.json` (`@playwright/test`, `test:e2e`).
- The pay gate was checked by setting `hold_expires_at` to 100 s ahead in the dev DB, instead of restarting with `HOLD_MINUTES=3`; same code path.
- The late-payment refund copy cannot be reached from the UI (the server gate blocks paying in the last 2 minutes); it is covered by the pay action unit tests and `staff-read.test.ts`.
- `deployment.md` does not exist; the `PAYMENT_WEBHOOK_SECRET` deploy note is in `02` (env table and exemptions).
- `/booking/[ref]` and `/book/pay/[ref]` call `notFound()` inside a streamed Suspense boundary, so another guest gets the 404 screen with HTTP 200 (no data shown). The `.ics` route returns a real 404.

## Open items
1. Another session was running integration tests on the same `TEST_DATABASE_URL` during this run; its test GST slabs (2099) overlapped mine and broke one early run of `cancel.test.ts`. All files were rerun after the database was idle. Parallel agents need separate test branches or unique slab dates.
2. Latency: about 490 ms per round trip to the Neon development branch from this machine. In `pnpm dev` a hold takes 15 to 30 s and a payment up to 30 s; `/rooms` was already 5 to 13 s. Batching queries in the hold and pay paths is a follow-up; deployed next to Neon it should be far lower.
3. Known limits carried into the TDD: failed and timed out attempts are not stored; Refresh hold can lose the last unit between cancel and reacquire; one guest's holds are serialized by the advisory lock (by design); zero total stays are not payable online; the mock email is a rendered view.
4. Development DB now holds test guests (`verify-*@example.test`, `e2e-*@example.test`) and their bookings: some confirmed, some cancelled, and a few holds from failed E2E runs that will expire. Reseed if a clean demo is needed.
5. H1's second path (staff approves a draft) waits for Q6.
6. `payBooking` double read (see Review fix round).
7. `TEST_DATABASE_URL` is still shared with Codex (same host in both worktrees). The review fix round ran with your confirmation that Codex was idle; a separate Neon test branch would remove the risk.

## Full integration run
- **Review fix round, final:** 88/88 in 12 files in one run (`--hookTimeout=120000 --testTimeout=180000`, the shared test DB confirmed idle with the scrum master). Booking files first: 17/17, then `booking` + `multiroom` 37/37 after the race-test change.
- First round:
  - Run 1 (default 10 s hooks): 55 passed, 9 failed, 18 skipped. All but one failure were hook or test timeouts; the one `NO_RATE` followed a timed out setup. At about 490 ms per round trip the fixture hooks alone are near 10 s. No assertion about booking behaviour failed.
  - Run 2 (`--hookTimeout=120000 --testTimeout=180000`, CLI only, no code change): 80 of 82 passed in 10 files. The 2 failures were both in `multiroom.test.ts` (B10 hold races, code this branch did not change), one again a 10 s hook timeout set inside that file.
  - `multiroom.test.ts` rerun alone: 9/9 passed. Every one of the 82 tests has passed; the suite is latency-bound from this machine. Suggest CI (or a run near Neon) as the authoritative gate.
