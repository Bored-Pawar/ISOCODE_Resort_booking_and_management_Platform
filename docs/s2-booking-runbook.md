# S2 runbook: finish the booking flow (B6 steps 2 and 3, B7, B8, B9, then A5)

Owner: **Claude Code (Opus), unattended**, in the main Claude worktree (`../resort-claude`). Scrum master approved 2026-11-08 17:45 IST.
Goal: a guest can build a stay, sign in, hold, pay in test mode and see a confirmation, end to end on real data. This is the last P0 gap in the core build.
Design sources: `01-booking-core.md` (state machine, late payment, pay gate), `05-design-system.md` (screens 4 and 5, HoldTimer, copy voice), `02-architecture.md` (security, perf budget), `07-backlog.md` (AC). Where this doc adds a rule, this doc wins until `01`/`07` are updated (part of this task).

## Locks for this run
Claude Code holds: `src/modules/{booking,payments}/**`, `src/app/(guest)/**`, `src/app/api/payments/**`, `src/app/(staff)/admin/bookings/**`, `src/components/ui/hold-timer.tsx`. Read only: `src/db/**` (no schema change in this run), `pricing`, `inventory`, enquiries, ai-router. Codex is on R1 to R4; do not touch `src/modules/{enquiries,ai-router}/**` or the `/enquire` form (it is being expanded into the single unified enquiry form with event fields). Booking pages only link to `/enquire` with prefill params; keep the existing param names (`checkIn`, `checkOut`, `adults`, `children`, `room`, `rooms`).

## Hard rules
1. Never push to `main`, never merge. Never touch the Neon production branch or its credentials.
2. Approved DB ops: `db:reset`, `db:migrate`, `db:seed` on development and test only, through `src/db/safety.ts`.
3. No schema change. No change to frozen signatures except the two additive items in "Approved contract additions".
4. Every server action and route handler: Zod first, then `requireRole('guest')` (or `requireRole` staff for A5). `guestId` comes from the session only. A booking ref in a URL is never authorisation; reads go through `booking.get(input, actor)`.
5. Prices only from `pricing` and the saved `bookings.total_paise`. The browser never sends an amount.
6. If blocked on one item, write it under "Open items" in the handoff and move to the next independent item.

## Approved contract additions (record in `01` Contracts and `06` decisions)
1. `booking.cancelHeld({ bookingId }, actor)`: owner only. One conditional `UPDATE bookings SET status='CANCELLED' WHERE id=$1 AND guest_id=$2 AND status='HELD' RETURNING`, then `held -= lines` per type and night via `adjustNights`, plus a `booking_events` row, in one booking owned transaction. Zero rows returns the current state (`NOT_HELD` with status), never an error throw. Same lock order as expiry (booking row, then ordered inventory).
2. `payments`: `MockProvider implements PaymentProvider` and `/api/payments/mock` webhook. New env name `PAYMENT_WEBHOOK_SECRET` (add to `.env.example`, `02`, `deployment.md` notes). No new table.

## Step 0: preflight (record results at the top of `docs/s2-booking-handoff.md`)
1. `git -C ../resort-claude status` clean. `git fetch origin`. Confirm `origin/main` contains B10 (`claude/multiroom`) and the stay builder (`claude/stay-builder`). If the stay builder PR is not merged yet, branch from `claude/stay-builder` and say so in the handoff; otherwise from `origin/main`.
2. `git switch -c claude/booking-flow origin/main` (or the fallback base). `pnpm install`.
3. Read `CLAUDE.md`, `01`, `05`, `02`, `07` (B6 to B9, A5, H1), `06` (latest decisions), the stay builder notes in `tdd-notes.md`. Check `node_modules/next/dist/docs/` for the installed APIs before writing Next code.
4. Baseline: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. Record.
5. Update the locks table in `06` for this branch (it still shows Codex as the S1 owner).

## Step 1: build, in this order, one commit per item

### 1. R07 HoldTimer fix (before anything uses it)
Fire `onExpire` once per target timestamp, not per callback identity. Unit test: rerender after zero with a new inline callback fires nothing; a new `expiresAt` arms it again. Add the under 2 minute warning state and an `onWarning` callback.

### 1b. Three month booking window (agreed product decision)
Direct online booking allows a check in date no later than today (IST) plus 3 calendar months. The stay may end after that date. There is no setting for it: one constant in `src/lib/booking-window.ts` with unit tests (month end edge cases, e.g. 30 Nov plus 3 months is 28 Feb). Enforce it in the home search, `/rooms`, room detail and `/book/details` with the copy "Online booking opens 3 months ahead. For later dates, send us an enquiry" and a prefilled `/enquire` link. The guest hold action rechecks it on the server and returns the same message. Services and contracts stay unchanged: this is a guest channel rule, not an inventory rule, so staff and enquiries are unaffected. Record it in `00` (assumption) and `06` (decision).

### 2. Promo code on the stay builder
`/rooms` summary gets an optional promo field carried as the `promo` URL param and passed into `quote()`. `PROMO_INVALID` shows inline under the field ("This code isn't valid for these dates"), the stay stays usable without it. Continue carries `promo` and the `quoteHash` of the quote shown. Zero total stays are not supported by the payment schema: if `totalPaise` would be 0, show "This code can't be used online, send us an enquiry" with the prefilled `/enquire` link and keep Continue disabled.

### 3. B6 step 2: `/book/details`
1. Reads the cart, dates, group, promo and `quoteHash` from the URL. Re-quotes on the server (same parser as `/rooms`). Invalid or empty cart: redirect to `/rooms` with its params.
2. Layout per `05` screen 4: StepIndicator "1 Room · 2 Details · 3 Pay", form left, sticky summary right (thumb, dates, one row per room line, PriceBlock). Mobile: summary collapsed at the top.
3. Signed out: inline "Create an account" (name, email, phone, password with confirm, DPDP consent with plain language notice) and a "Already have an account? Sign in" link with `next` set to this exact URL. Reuse the existing sign up schema and action logic; do not fork it. Signed in: show name and email, editable phone, consent already on file shown as a line, plus a short notice: "We only ask for what we need for your stay. Passport details for foreign guests are taken at check in."
4. Submit calls `acquireBookingHold` with the stay from the URL and the URL `quoteHash`. Branch on every code:
   - `ok`: `clearStoredStay()` on the client after redirect, go to `/book/pay/[ref]`.
   - `PRICE_CHANGED`: stay on the page, show old and new total, button "Continue at ₹x" which replaces the URL hash and resubmits. No stock was taken.
   - `SOLD_OUT` (with `roomTypeId`), `BLACKOUT`: back to `/rooms` with the cart and a `notice` param; the stay builder shows the message on that room's card.
   - `NO_RATE` / `OVER_OCCUPANCY` with `lineIndex`: back to `/rooms`, message on that line.
   - `PROMO_INVALID`: back to `/rooms` with the field error.
   - `INVALID_INPUT`: inline ErrorState with Retry.
5. Double hold guard: before acquiring, call `booking.listForGuest` and if the guest already has an unexpired HELD booking with the same `quoteHash` and dates, redirect to its pay page instead of holding again (back button, double submit).

### 4. `booking.cancelHeld` (contract addition 1)
Implement plus PostgreSQL tests: cancel releases stock once; cancel vs expiry race releases once; cancel vs confirm race ends in exactly one terminal state with stock reconciled; a non owner gets `FORBIDDEN`; cancelling a CONFIRMED booking returns `NOT_HELD`.

### 5. B6 step 3 and B7: `/book/pay/[ref]` and the mock gateway
1. Server page: `booking.get` with the session actor. Not HELD: CONFIRMED goes to the confirmation page, EXPIRED or CANCELLED shows "This hold has ended. Your rooms were released." with "Build the stay again" (back to `/rooms` with the same cart rebuilt from `booking.rooms`).
2. Card per `05`: "Pay ₹x (test mode)", a clear Test mode label, HoldTimer ("Held for you · 08:42"), and three test outcomes as radio cards: Payment succeeds, Card declined, Bank times out. Default: succeeds.
3. Pay gate: under 2 minutes left, Pay is disabled and "Refresh hold" appears. Refresh = `cancelHeld` then a fresh `acquireBookingHold` for the same cart, in that order; if the fresh hold fails, show the matching message from item 3. The server action rechecks the 2 minute rule itself; the button state is not trusted.
4. `payBooking` server action: Zod (`ref`, `outcome`, `attemptId`), `requireRole('guest')`, owner check, amount = saved `totalPaise`. `attemptId` is a UUID rendered into the form, so a double click reuses it and the provider payment id is `mock_<bookingId>_<attemptId>`; duplicates replay as `ALREADY_CONFIRMED`.
5. `MockProvider.charge`: success builds a webhook payload `{ providerPaymentId, bookingId, amountPaise, status }`, signs it with HMAC SHA-256 using `PAYMENT_WEBHOOK_SECRET`, and calls the same handler function the route uses, in process (no request derived URL, same pattern as the `/dev/test` fix). Declined returns FAILED without a webhook. Timeout returns TIMEOUT without a webhook.
6. `/api/payments/mock` route: constant time HMAC check (fails closed when the secret is unset), Zod, then `booking.confirmPayment`. Machine endpoint: record its exemption in `02` next to the cron one.
7. UI per result: CONFIRMED or ALREADY_CONFIRMED goes to `/booking/[ref]`. REFUND_PENDING shows the `01` copy: "Payment received after your hold expired. It will be refunded. Book again?" Declined: "Your card was declined. Your rooms are still held for mm:ss. Try again." Timeout: "We didn't hear back from the bank. Check status" (re-reads the booking) and Retry with a new `attemptId`.
8. Failed attempts are not stored (no contract for it). Log as a known limit.

### 6. B8 confirmation: `/booking/[ref]`
Owner only. Per `05` screen 5: check icon, "Your stay is confirmed", ref large, dates line ("Sat 14 Nov to Mon 16 Nov · 2 nights"), one block per room line (type, plan, party), price breakdown with GST per line and total, check in note ("Foreign guests: please bring your passport. We complete Form C at the desk."), "Add to calendar" (`/booking/[ref]/ics`, owner only, all day event), "Back to home". Non confirmed refs show their real state, never a false confirmation.
Mock email: no outbox table, so the outbox is derived. `/booking/[ref]/email` renders the confirmation email (owner), and `/dev/outbox` (staff, behind `DEV_TOOLS_ENABLED`) lists the last 20 confirmed bookings with their rendered emails. Record this decision in `06`.

### 7. B9 My bookings
`/account` rows link to `/booking/[ref]`. A valid HELD row shows "Resume payment" (to the pay page) and "Cancel" (calls `cancelHeld`, confirm dialog, toast). Empty state already exists; keep it.

### 8. A5 staff bookings (P1, only if items 1 to 7 are green)
`/admin/bookings`: dense table (ref, guest, dates, rooms, total, status, created), filters by status and check in range, detail with the `booking_events` timeline, and a "Refund pending" tab listing REFUND_PENDING payments. Read only; additive staff read `booking.listForStaff` with `requireRole` reservations or gm (sales has no booking authority in current scope; hide the nav item for sales). Record the addition in `01`.

### 9. H1 Playwright happy path (P0)
One test: search, add a room, continue, sign up inline, hold, pay (succeeds), see the confirmation ref. Runs against `pnpm dev` with the development DB in CI style env, skipped when `E2E_BASE_URL` is unset. If Playwright setup costs more than 30 minutes, record it as open and move on.

## Step 2: verify
1. `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, then `pnpm test:integration` against `TEST_DATABASE_URL` (booking files at least; full suite if time allows, it takes about 20 minutes).
2. `pnpm dev`, real Chrome, desktop and 375px: price changed path (edit a rate in the dev DB between `/rooms` and Continue), sold out path (last Pool Villa), declined then succeeds, timeout then check status, hold expiry with `HOLD_MINUTES=3` (gate appears, refresh hold works), late payment after expiry shows the refund copy, cancel from My bookings, a second guest opening another guest's `/booking/[ref]` gets 404. Screenshots `docs/screenshots/b6-*`, `b8-*`, `b9-*`.
3. Independent check: spawn a review subagent with no context. Give it this runbook, `01` and `git diff origin/main...HEAD`. Ask for blockers and majors only: authorisation on every entry point, amount trust, idempotency of pay and webhook, cancel and expiry races, dead buttons. Fix blockers and majors; list the rest.

## Step 3: hand off
1. Push `claude/booking-flow` and open a PR into `main`. Do not merge.
2. `docs/s2-booking-handoff.md`, under 80 lines: base SHA, commits, what works with evidence, test counts actually run, deviations, open items.
3. Update `06-progress.md` (rows B6 to B9, A5, H1; the two contract additions; the derived outbox; failed attempts not stored) and `tdd-notes.md`.

## Known limits to carry into the TDD
1. Failed and timed out attempts are not persisted.
2. Refresh hold can lose the last unit between cancel and reacquire.
3. Zero total stays are not payable online.
4. Mock email is a rendered view, not a sent message.
