# S2 R1–R4 implementation handoff

Base: `e1e3d92d80ccfa6b2e89dd4fd23166bde11ba944` (fetched `origin/main`, including approved B10 and stay builder). `codex/dev` already contained this exact commit, so synchronization required no merge/rebase. The existing isolated Codex worktree uses `codex/r1-r4-ai-routing`; user-supplied final handoff was preserved in the first commit.

Implementation is prepared for one independent Claude Opus code review. No independent approval, remote CI result, push, PR, merge or deployment is claimed.

## Changes

- `src/modules/ai-provider/`: generic provider selection and one AI SDK 7 structured call for Google, Anthropic and OpenAI-compatible local; zero-call rules; ten-second attempts, one bounded transient retry and sanitized transport errors. No domain/database imports.
- `src/modules/enquiries/internal.ts`: short atomic claim/settle transactions, persisted attempt/timestamp generations, exact two-minute recovery boundary, batch five, staff-change checks, source/consent merge and conditional draft/alert/audit inserts. No schema migration.
- `src/modules/ai-router/`: validated classification/extraction, PII redaction, prompt, conservative rules, deterministic role routing, complaint alerts, safe prose guard/templates and stock-aware matching EP carts up to four room lines. Final quotes always come from public `pricing.quote()`; every draft remains unapproved/unsent.
- Intake/list register Next `after()` work through `enquiries/scheduling.ts`. Both inbound handlers export 60-second duration, verified in the production build manifest. Guest/dev action duration inherits its existing page/platform limit; interrupted work is recoverable.
- Unit and PostgreSQL integration tests, `scripts/eval-ai.mts`, synthetic evidence, optional `vitest.postgres.config.mts` remote test profile and provider setup documentation.

## Actual verification

- Baseline: typecheck, lint, 232 unit tests and production build passed.
- Final code checks: typecheck, lint, 299 unit tests across 41 files, production build and changed-file formatting pass.
- Focused PostgreSQL: **21/21 passed across two files**, 244.55 seconds, with the guarded isolated test branch and explicit remote test budgets. Includes all five critical enquiries, real public pricing/GST for the villa, multi-room stock, stale generations, duplicate claims/settles, staff protection, rollback and source idempotency.
- Initial broad PostgreSQL: **60 passed, 15 failed, 9 skipped**, 1593.55 seconds. Overlapping 2099 test GST fixtures and remote hook/test timeouts are retained in `evidence/ai-postgres-first-regression.md`. No manual cleanup/reset was used to mask them; a subsequent read-only query found no duplicate schedules.
- Affected existing regressions: **24/24 passed across five files**, 566.12 seconds, with unchanged assertions and longer remote test budgets. The name filter intentionally deselected 27 already-covered cases. This covers all earlier failed/skipped existing cases; combined with the initial passing cases and focused AI suite, all 95 unique PostgreSQL cases have a passing observation. This is cumulative coverage, not a claim that the original broad command passed.
- After the final Unicode placeholder normalization safeguard, the targeted real villa quote/GST regression passed again (23.59 seconds, one selected case; ten intentionally deselected).
- Rules-only smoke/evaluation: **5/5 and 30/30 labels matched**, all fallback/unsorted. Evidence explicitly sets live-model accuracy/latency/schema/draft metrics to null. These are rule measurements, not model measurements. No live API calls, observed provider 429 behavior or quota measurements exist.

Reproduce focused PG checks with:

```powershell
pnpm exec tsx --env-file-if-exists=.env.local scripts/ai-preflight.mts
pnpm exec vitest run --config vitest.postgres.config.mts tests/integration/ai-processing.test.ts tests/integration/ai-routing.test.ts --reporter verbose
pnpm exec vitest run --config vitest.postgres.config.mts tests/integration/booking.test.ts tests/integration/multiroom.test.ts tests/integration/pricing.test.ts tests/integration/booking-list.test.ts tests/integration/schema.test.ts --testNamePattern 'mandatory [12679]:|B10 multi-room|B1 database pricing|booking.listForGuest|rejects invalid bookings' --reporter verbose
```

The repository safety guard refuses a missing/protected test endpoint or a test URL sharing the development host. Development and production were not test targets.

## Provider readiness and limits

No Google/Anthropic credentials or local endpoint/model are configured; Ollama is absent. Adapter and mocked HTTP/SDK checks pass. Exact local setup and env names are in `s2-ai-provider-setup.md`; no large model, GPU settings or machine-wide settings were changed. Hosted Haiku needs environment configuration alone, with an accessible account model ID. Live smoke/evaluation remains a deployment-readiness gate.

No frozen public service signature/type-shape deviation. R08 validation tightening, the generic provider module and D6 internal enquiries bridge are explicitly approved by the execution handoff. `users` has no active flag: existing target-role accounts are eligible in `created_at,id` order. Missing role means unsorted; without a GM account a notification has no recipient, while complaint/unsorted flags remain visible.

Automatic estimates cover EP room-only plans, at most four lines and stays up to 180 nights; unsupported/missing details go to staff. This is a work bound, not a three-month enquiry horizon. Prices/stock are nonbinding snapshots and never reserve rooms. PII redaction is pattern-based minimization, not universal entity recognition. Q4–Q7, approval/send UX and manual failed-row retry remain separate assignments. Staff mutations should follow the enquiry row-lock protocol.

Database, pricing, inventory, booking, payments, catalog and guest UI sources are unchanged from base. Existing booking cron is unchanged. No new environment-variable names were needed.

## Implementation commits and review

- `f457d4c` — structured provider transport and preflight.
- `2d71b89` — atomic claim/settle persistence.
- `b4d022a` — validated, redacted classification and routing.
- `69a2ab6` — safe quote-backed drafts and scheduling.
- `0fee97c` — synthetic smoke/evaluation runner and evidence.
- `68794db` — specific-room selection fix and remote PG verification profile.
- `0a5f9a5` — normalize guarded draft placeholders; unit and real villa quote regression verified.

Review focus: generation/staff-edit serialization; reserved metadata preservation; complaint notifications under fallback; named-type/stock/occupancy selection; the separation of draft safety from classification success; and provider timeout/error handling. Review must be independent; these local checks do not approve a merge.
