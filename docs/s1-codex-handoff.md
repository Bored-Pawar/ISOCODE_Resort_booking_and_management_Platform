# S1 Codex handoff — B1 to B5

Date: 2026-11-08 (IST). This is an implementation handoff, **not** a replacement for frozen service contracts.

## Assignment and start gate
Codex owns B1, B2, B3, B4, B5 together. Work on a distinct branch/worktree from the same agreed base commit Claude Code will use. Before editing: confirm lock ownership with scrum master, clean Git state, base SHA, presence of S0 fix commits (`69cadf6`, `c04ebd6`, `8a6369f`, `6a1fe68`, `e91d69f`, `4d6d717`) in ancestry or equivalent merged source; inspect current code and tests rather than assuming a branch contains them. Do not reset, seed, migrate or test against an unverified database.

## Authority / context order
1. `docs/00-requirements.md` and original problem statement (client goals).
2. `docs/01-booking-core.md` (state machine, all nine mandatory Postgres tests, transactional contracts).
3. `docs/07-backlog.md` (B1–B5 acceptance criteria / DoD).
4. `docs/06-progress.md` (latest approved decisions, fixes, coordination locks).
5. Current source and tests at the agreed commit (actual behavior, not assumed implementation).
6. `docs/02-architecture.md`, `docs/03-data-model.md`, `docs/tdd-notes.md` and `CLAUDE.md`/`AGENTS.md` if present in repo.
7. `docs/s0-review-codex.md`, `docs/s0-feature-map.md`, `docs/s0-handover.md` are **unaltered historical evidence**, not fresh review verdicts. Do not modify them or reopen R01–R05 just because the dated report lists them.

## Exclusive code locks for this assignment
- Codex only: `src/db/**`, `src/modules/pricing/**`, `src/modules/inventory/**`, `src/modules/booking/**`, `src/modules/payments/**`. Database ownership is to avoid colliding seed/schema edits; do not change schema or implement B7 unless separately approved.
- Claude Code only: G1–G3 guest screens under `src/app/(guest)/**`, `src/modules/catalog/**`, and guest-screen-local components. Use frozen public pricing and inventory contracts, against coherent fixtures until real services merge.
- Shared UI kit, shared lib/auth, cross-feature routes, CI configuration and docs: coordinate before overlapping edits. Codex's B4 cron route is explicitly within its assigned B4 work; Claude must not edit it.

## Contracts and rules that must hold
- Public `index.ts` service contracts remain frozen. `booking` may import only the documented `pricing/internal` and `inventory/internal` exception for transaction-scoped helper operations. `booking` owns shared DB transactions; helpers accept `Tx` and never commit.
- Inventory: lock every requested date in ascending order in the same transaction; no partial holds, no oversell. Keep database `sold + held <= allotment` constraint. Blackouts block new holds, not existing bookings.
- Pricing: one pricing-owned computation for runtime and seed; integer paise; nightly GST selected by effective slab after allocated discount; R09 capped flat discount redistributed correctly; deterministic snapshot totals. Hold rechecks the displayed `quoteHash` within the DB transaction; return `PRICE_CHANGED` with new quote, taking no inventory if stale.
- Holds: `HOLD_MINUTES` controls expiry; run lazy release before availability/hold, plus cron. `releaseExpiredHoldsInTx` needed early by B3, full public API/cron under B4. Repeat/concurrent release decrements stock once.
- Payments: amount exactly saved `bookings.total_paise`, not client price; conditional transition and same-transaction booking event; repeated provider payment ID idempotent. Confirm only within valid HELD period. Late successful payment is `REFUND_PENDING`, booking remains terminal, inventory untouched. Do not build mock payment provider/webhook UI (B7).
- Return typed business failures, throw infrastructure errors after rollback. The trusted route/action derives `guestId` from server session; never trust a client-supplied guest ID.

## Suggested milestones
0. Preflight: record SHA, branch/worktree, locks, test DB safety, baseline typecheck/lint/unit tests.
1. B1: real `quote` and `quoteInTx`, pricing pure core, GST/promos, R09 fix; tests and seeded snapshot reconciliation.
2. B2: real `availability` and `lockNights`, ordered nightly read/lock, blackouts, lazy expiry integration.
3. B3: transactionally safe `acquireHold`, shared internal expiry helper, one-shot inventory adjustment, price recheck, `booking_nights`/event writes, deadlock retry.
4. B4: public safe expiry release and authenticated cron (via `CRON_SECRET`), concurrency/idempotency tests.
5. B5: real `confirmPayment`, duplicate/late behavior and audit events, race tests.

## Proof required before review
Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` and `pnpm test:integration` (only with validated disposable `TEST_DATABASE_URL`). Demonstrate all **nine** `01-booking-core.md` tests against real PostgreSQL, particularly exactly one of 20 parallel last-room holds. Add boundaries for expiry vs confirm, repeated late payments, R09 uneven nights, promo and occupancy revalidation, missing rates, and price snapshot arithmetic. Report which tests actually ran, not just which were authored. Do not claim remote CI success or deployment without evidence.

## Merge and review coordination
Create an early B1+B2 PR for independent Claude Code (Opus) review; merge to `main` once its tests and CI are green instead of waiting for B3–B5. Coordinate with Claude before it switches its guest screens to the real APIs. G1–G3 receive an independent Codex review. Each developer edits only their own progress rows; otherwise send progress updates to the scrum master to apply to `06-progress.md` on `main`. After G1–G3, Claude takes Q1–Q3; R1–R2 belong to whichever developer finishes first, following explicit reassignment.

## Deliverable report
Small logical commits mapped to B1–B5; changed files, technical decisions, test counts/evidence, remaining risks, contract deviations (if any), and current Git SHA. Update `docs/06-progress.md` and `docs/tdd-notes.md` when milestones merge. Never self-authorize a public contract/schema or booking-state change. Wait for independent review before integration to main.
