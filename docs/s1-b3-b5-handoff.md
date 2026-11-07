# B3–B5 local implementation handoff

Review base: `2813989` (reviewed B1+B2 fixes). Worktree/branch: `resort-codex` / `codex/dev`. Existing history is preserved; no merge, rebase, reset, push, PR or deployment is authorised by this assignment. B1+B2 have already merged independently on main.

## Implementation

- B3: booking-owned hold transaction, scoped lazy expiry, ordered inventory locks, transaction repricing/hash comparison, stock adjustment, frozen nightly snapshots and transactional audit. Any business rejection rolls back the initial expiry too. Deadlock/serialization errors retry once; exhaustion returns `SOLD_OUT`.
- The guest action `acquireBookingHold` derives the guest ID from `requireRole('guest')`; a browser ID is discarded. Persisted booking reads check the verified actor's ownership and return saved prices.
- B4: idempotent `SKIP LOCKED` expiry, ordered batch inventory release and audit events. A longer expired stay and a fresh request lock their combined dates before adjustments. Availability retains its reviewed room/date scope; confirmation targets only its booking; cron is the full sweep.
- Cron: `GET /api/cron/expire-holds`, Zod validation and `CRON_SECRET` bearer authentication with a constant-time digest comparison. `vercel.json` schedules daily 00:00 UTC (05:30 IST); lazy expiry is primary. No deployment was performed.
- B5: saved-total validation, a conditional HELD transition, provider-ID uniqueness, atomic payment/stock/event/promo writes and duplicate-result replay. Expired/cancelled bookings remain terminal; a late or distinct extra charge records one `REFUND_PENDING` obligation per provider payment ID. Reusing an ID for another booking/provider/amount is rejected.
- Confirmation acquires its booking write lock before payment or stock locks. If a pre-lock clock evaluation became stale while waiting, a post-lock database-clock check rolls the transaction back and retries expiry. A hold crossing its deadline after the initial lazy sweep is settled in the same conditional update.

## Review focus

1. Whole-transaction rollback, including initial expiry and audit failures.
2. Ordered union locks when expired and requested stays have different boundaries.
3. Same-ID duplicate confirmation/refund versus distinct extra payments; cross-booking ID conflicts must roll back the losing transition.
4. Exact expiry equality, confirmation/expiry races and a payment waiting across the real database deadline.
5. Machine cron authentication and verified guest identity; B7's gateway/webhook is intentionally absent.

## Mandatory PostgreSQL test map

All nine outcomes below passed in the complete 60-test, 6-file PostgreSQL gate (744.98 s).

| # | Requirement | Test location |
|---|---|---|
| 1 | 20 parallel last-unit holds; exactly one winner | `booking.test.ts`, mandatory 1 |
| 2 | One unavailable night rolls back all nights | `booking.test.ts`, mandatory 2 |
| 3 | Concurrent double expiry releases once | Existing `inventory.test.ts`, mandatory test 3; overlapping batch proof in `booking.test.ts` |
| 4 | Duplicate payment confirms once | `booking.test.ts`, mandatory 4 |
| 5 | Late payment stays EXPIRED, one refund, no reacquisition | `booking.test.ts`, mandatory 5 |
| 6 | Allotment cut below committed is rejected | `booking.test.ts`, mandatory 6; conditional SQL rule plus database CHECK (A2 UI/service remains separate) |
| 7 | Blackout rejects a hold | `booking.test.ts`, mandatory 7 |
| 8 | Both sides of the GST slab boundary | Existing `pricing.test.ts`, first test; pricing calculation unit tests |
| 9 | Changed price returns fresh quote without taking stock | `booking.test.ts`, mandatory 9; also proves rollback of lazy expiry |

The new lifecycle suite reconciles stock against persisted HELD/CONFIRMED bookings after every test. Additional proofs cover FK/audit rollback, configured hold duration, rate/promo/occupancy revalidation, frozen snapshots, retry exhaustion, locked expiry rows and terminal cancellation.

## Integration boundaries

Public contracts and schema are unchanged. Guest/catalog files, B7 and historical S0 review documents are untouched. B6/B7 must call the trusted action/service from authenticated server entry points; gateway callbacks must verify the provider before calling confirmation. Promo max-use overshoot remains the previously approved limit. Existing decisions about promo stay-window validity and frozen-schema range caps remain recorded in `06-progress.md`.

The existing payment schema accepts positive amounts only: zero-total promotions have no supported confirmation path. Enabling free stays needs a separately approved policy/contract change; this implementation preserves the frozen schema. Remote CI/deployment are not run for these local-only commits.

## Executed verification

- `pnpm typecheck`, `pnpm lint`: pass.
- `pnpm test`: 74/74 tests, 15 files, pass.
- `pnpm test:integration --reporter=verbose`: 60/60 tests, 6 files, pass (744.98 s).
- After the final UUID comparison fix, `-t 'mandatory 4|honours HOLD_MINUTES'`: both affected PostgreSQL cases pass (58.23 s), including uppercase UUID assertions.
- `pnpm build`: pass, including the dynamic expiry route.
- Whole-repository Prettier with `--end-of-line auto`: pass; raw `pnpm format:check` flags the existing Windows CRLF checkout limitation. Committed-LF formatting is checked separately in the final delivery.
- Frozen booking types, schemas and method signatures match reviewed `2813989` by AST comparison. Schema, migration, guest/catalog and historical-review diffs are empty.

Local implementation commits: B3 `8da7d2c`, B4 `80064bf`, and B5 at the final local HEAD reported in the delivery. No new remote CI is claimed because pushing these commits is not authorised.

Changed files: booking's `index`, `internal`, `hold`, `read`, `transaction`, `actions`, `clock`, `confirmation` and related unit tests; inventory/pricing internal transaction helpers; expiry cron route/unit test and `vercel.json`; `tests/integration/booking.test.ts`, migrated stub assertions in `tests/unit/contracts.test.ts`; Codex progress/TDD notes and this handoff. Fixtures and public input/result types remain unchanged.
