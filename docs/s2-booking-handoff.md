# S2 booking flow handoff (Claude Code, branch `claude/booking-flow`)

Runbook: `s2-booking-runbook.md` (updated mid-run with item 1b, the `/enquire` lock and A5 roles). Unattended run, 2026-11-08. Not merged; PR into `main` opened at the end.

## Preflight (Step 0)
- Worktree `resort-claude` was clean apart from the new runbook. `origin/main` = `e1e3d92` already contains `claude/multiroom` (B10) and `claude/stay-builder`, so the branch is cut from `origin/main` (no fallback).
- `pnpm install` up to date; Next.js 16.4.5 docs read from `node_modules/next/dist/docs/`.
- Baseline at `e1e3d92`: typecheck, lint, build pass; 232 unit tests in 34 files pass. Locks table in `06` updated.

## Commits (base `e1e3d92`)
`cb498f3` runbook and locks · `9c9b378` R07 HoldTimer · `70fca7a` runbook update · `625d89b` 1b three month window · `3f2c7c6` 2 promo · `ddbe5d6` 3 `/book/details` · `de44178` 4 `cancelHeld` · `8cb50e9` 5 pay step and mock gateway · `0e9a628` 6 confirmation, ics, email, outbox · `3d28bfc` 7 My bookings · `9cf3235` 8 A5 · `b7c3583` 9 Playwright · `6497d26` promo wording and screenshots · `8389bce` docs · `8e1d4f6` review majors.

## What works, with evidence
- **Gates (final):** typecheck, lint, `format:check` (all files pass), 287 unit tests in 42 files, `pnpm build`.
- **PostgreSQL (`TEST_DATABASE_URL`):** `cancel.test.ts` 6/6 (release once, cancel vs expiry both ways, cancel vs confirm one terminal state, non-owner FORBIDDEN, CONFIRMED is NOT_HELD), `staff-read.test.ts` 2/2, `booking-list.test.ts` 3/3. Full suite: see "Full integration run" below.
- **Playwright H1:** `E2E_BASE_URL=http://localhost:3100 pnpm test:e2e` passed (search, add room, Continue, inline sign up, hold, pay, confirmation ref) in 1.8 min against `pnpm dev` and the development DB.
- **Real Chrome checks (scripted Playwright, desktop and 375px), all passed:** promo invalid inline and applied; Continue carries `promo` and `quoteHash`; rate edited in the dev DB between page and submit gives PRICE_CHANGED with old and new total, "Continue at ₹x" holds; declined then succeeds confirms; `.ics` is `text/calendar` with an all-day event; email view; timeout then Check status; hold set to 100 s left shows the gate (Pay disabled, Refresh hold), a forced Pay click is refused by the server, Refresh hold cancels the old hold and takes a new one; Cancel from My bookings (dialog, toast, CANCELLED); last Pool Villa taken (allotment set to committed, then restored) sends the guest back to `/rooms` with the sold-out notice; three month window on `/rooms` and `/book/details`; a second guest gets the 404 screen for another guest's `/booking/[ref]` and `/book/pay/[ref]`, and a real 404 for the `.ics`; no horizontal overflow at 375px on details, pay, confirmation and My bookings. Screenshots `docs/screenshots/b6-*`, `b8-*`, `b9-*`. The rate and allotment edits were restored.
- **Independent review (Step 2.3):** no blockers. Two majors, both fixed in `8e1d4f6`: (1) Refresh hold could take a second hold (two tabs or a replayed ref) and did not recheck the 2 minute rule: it now refuses while more than 2 minutes remain, and reuses an existing live hold for the same priced stay; (2) a late payment was only visible in the pay panel: `/booking/[ref]` and My bookings now show the `01` refund copy through the new read `refundPendingForGuest`.

## Deviations
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
3. Known limits carried into the TDD: failed and timed out attempts are not stored; Refresh hold can lose the last unit between cancel and reacquire; zero total stays are not payable online; the mock email is a rendered view.
4. Development DB now holds test guests (`verify-*@example.test`, `e2e-*@example.test`) and their bookings: some confirmed, some cancelled, and a few holds from failed E2E runs that will expire. Reseed if a clean demo is needed.
5. H1's second path (staff approves a draft) waits for Q6.

## Full integration run
(filled in below when it finishes)
