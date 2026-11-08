# R1–R4 architecture audit remediation

Date: 2026-11-08. Branch: `codex/r1-r4-ai-routing`. Reviewed baseline: `39d168f550cf9695c94f2dd54e6f98598cfdfec9`. Production implementation checkpoint: `2fe0be891a7732ef223c7efa73f92dd5e65e29f0`. Subsequent validation changes test setup/fixtures, documentation and evidence only.

## 1. Executive summary

**B1 is resolved in the implementation:** unsupported model extraction cannot enter quote selection or attach a trusted price through the safe template. M1 and M5 are implemented with passing unit regressions. All eight findings have focused implementation commits. M2, M3, M4 and M7 corrections are implemented; M6 safety corrections are implemented, but its under-30% template fallback target is **not achieved**.

Final gates: typecheck, lint, **433/433 unit tests in 49 files**, production build, and **34/34 real PostgreSQL integration tests in two files** pass: **467 passed, zero failed**. The scrum master explicitly confirmed the replacement `TEST_DATABASE_URL` was isolated, lifting the earlier hold. Guarded preflight reached PostgreSQL 18.6 with zero public tables. Existing repository migrations were applied only to that isolated target, without new migration files, seed or reset. The focused suite passed in **382.24 seconds**; a read-only follow-up confirmed zero remaining test enquiries, drafts, events, notifications, users, rooms and tax slabs. Shared databases were untouched.

Independent Claude re-audit of B1, M1 and M5 remains required. No merge readiness, independent approval or deployment is claimed. Main advanced separately during the task; no synchronization was attempted under the explicit no-merge/no-rebase instruction.

## 2. Repository safety and commit register

Initial worktree was on `codex/r1-r4-ollama-benchmark`, at the exact reviewed baseline. `codex/r1-r4-ai-routing` pointed to the same SHA, so switching preserved all changes without reset/stash/clean. The original dirty files were `docs/04-ai-router.md`, `docs/06-progress.md`, `docs/s2-ai-provider-setup.md`, `src/modules/ai-provider/execute.ts`, `provider.test.ts`, and untracked `docs/reviews/**`, `tests/benchmarks/**`, `tests/unit/ollama-benchmark.test.ts`. All belonged to the Ollama benchmark and were preserved separately in `0f2ce67355f402061d579cd4e54dab7bbb9fa18c` before remediation.

The audit was copied unchanged from `../resort-ai-routing-architecture-audit/docs/reviews/r1-r4-architecture-fault-audit.md`. Both copies have SHA256 `3f46f2a33423366b77c1ab16d3f3472ff9fa740b4cc9c4cc331312cd93d64bfc`. Actual relevant document paths are `docs/04-ai-router.md` and `docs/07-backlog.md`; handoff is `docs/s2-r1-r4-implementation-handoff.md`. Original audit/benchmark findings were not rewritten.

| Finding | Focused commit | Principal files changed | Status |
|---|---|---|---|
| B1 | `fc0383561c248b2366f81b134427e5ae62c172f7` | ai-router grounding, processing, quote selection, draft and tests; docs | Fixed; unit and PostgreSQL quote-gate proof passed |
| M1 | `3ab260983d63c4245fcfdd6016915bdf6c91417c` | ai-router room-preference, matching, PII and tests; docs | Fixed |
| M2 | `851c236324d4e386c8e31455ed95a1b21bc9afad` | ai-provider execute/transport and HTTP tests; benchmark wrapper; setup docs | Fixed |
| M3 | `78d4567b8b68324d0e76c0969c967e032fcaed89` | enquiries queue/Retry; processing; staff recovery UI; lifecycle tests; docs | Fixed; PG cap, Retry race and actor audit passed |
| M4 | `e092397da1b4b493648c3c02e0e3917bfcc4bc4d` | enquiries batch claim/scheduling; ai-router recovery; existing cron/tests; docs 02/04/07 | Fixed; PG concurrent sweep and generation tests passed |
| M5 | `93dd74662f990ee48c907c988ac0341fda78ef5f` | ai-router complaints, routing, fallback, model flag and tests; docs | Fixed; PG mixed-intent owner and alert deduplication passed |
| M6 | `dc7a9feff165d2f19cc41a3c01589bceff792162` | ai-router prose guard/tests; replay harness/evidence; docs | Safety fixed; quality target unmet |
| M7 | `7a6a1e0044adebf8b8bca0df29f54fe3f28649e3` | ai-router PII and payload tests; docs | Fixed within documented pattern limits |

Additional final regression commit `218aadbca463e4f4307acbe74d26a2a7f7b5ba2c` preserves exact saved pricing snapshots, rejects truncated compound/negative/fractional word counts, aligns evaluation callers with production guard context, versions prompt metadata and adds full-path PostgreSQL assertions. The eight focused finding commits remain separately reviewable.

Branch relationship at final source checkpoint: merge base with `origin/main` is `e1e3d92d80ccfa6b2e89dd4fd23166bde11ba944`; then-current `origin/main` was `444840d70468143629410c7407eb0fa03790d247`, with 25 commits unique to main and 19 unique to this branch. No fetch, merge, rebase or push was performed in remediation.

Final conservative B1 follow-up `2fe0be891a7732ef223c7efa73f92dd5e65e29f0` additionally rejects explicitly excluded dates (including “14–16 Nov is not possible”), negated counts, Unicode negative signs and fractional separators. These additions raise the final unit count to 433 without changing saved-output replay metrics.

Isolated validation follow-up adds `tests/integration/prepare-ai-tests.mts` (existing guarded migration helper and read-only fixture check), self-owned GST fixtures in the routing tests, and `r1-r4-postgres-remediation.json`. No application, protected module or schema source changed in this follow-up.

## 3. B1 grounding verification

Data path: original server `raw_text` → `groundExtraction(raw, classification, todayIST())` → evidence/eligibility → independently gated `selectQuote` → existing public catalog/inventory/pricing services → `buildDraft` checks the quote's dates and summed party against evidence → trusted quote basis → atomic settlement. Only redacted text and reference date enter the model request. Raw text is never used as provider diagnostics.

Supported common formats include ISO dates, Indian numeric day/month/year, contextual day/month dates, English month names/abbreviations, shared day ranges and December-to-January ranges. Calendar validity, ordering, explicit years and non-past check-in are enforced. Omitted years resolve to the next occurrence. Extra/conflicting dates fail closed. Adult labels are required; totals never imply adults. English and common Hinglish number words are supported. Composite, fractional, negative or ambiguous counts cannot be truncated into valid smaller counts. Unsupported formats ask for clarification.

Evidence is merged into existing `extracted.grounding` (`dates`, `guests`, `room`, values `ok|missing|unsupported`), preserving source idempotency/consent metadata and existing extraction fields. The additive staff review read exposes evidence without changing the frozen Enquiry list shape.

Unit spies prove unsupported extraction never calls pricing or inventory. T27-style February 30 “correction”, negative adults, fractional children, contradictory dates, past check-in, explicit-year mismatches and prices resembling numeric dates are rejected. Valid explicit ranges/party, omitted-year resolution, December/January and missing-child qualification are covered. PostgreSQL tests additionally prove the first five unsafe scenarios preserve model `ok` and reservations ownership, never invoke live pricing and persist a null-price clarification. The positive villa case computes a real GST-inclusive quote through public pricing, so the gate does not merely disable every quote. A separate template test proves `{{QUOTE}}` cannot bypass absent grounding.

Final prose starts with trusted `Quoted for <dates>, <party>, <catalog room names>: …`, includes GST, states indicative/subject to availability/no hold, and explicitly says when children were not supplied. Catalog display labels are excluded from the saved public pricing snapshot. Schema-invalid model responses retain the existing R3 fallback policy; schema-valid but unsupported quote details preserve classification/routing.

## 4. Complaint and GM alert verification

Shared `hasComplaint` combines model category, optional supported `isComplaint` boolean and original-text English/Hinglish/Devanagari keyword rules. Boundaries avoid unrelated-word substrings. It runs for successful classifications and is shared by rules fallback. Complaint detection is independent of owner selection: high-confidence `room` still assigns reservations while `notifyGm=true`; wedding/offsite can similarly retain sales.

Settlement retains its row lock, claim generation and atomic conditional notification/draft inserts. Repeated settlement cannot duplicate an alert. Unit cases cover ordinary enquiries, refund/mixed complaints, Hindi, Hinglish, model flags, fallback and process-to-settlement payloads. PostgreSQL verification passed: a high-confidence room classification with a raw complaint retained reservations, persisted `is_complaint=true`, and repeated processing left exactly one complaint notification and one draft.

## 5. Timeout, attempts, Retry and recovery

- Application: 10,000 ms per attempt for **every** provider, at most one transient retry, Retry-After at most 1,000 ms. Maximum provider budget is 21 seconds against an unchanged 120-second stale threshold. The installed SDK HTTP path is tested to receive and abort both request signals.
- Benchmark: explicit 1,800,000 ms wrapper under `tests/benchmarks/ollama/provider.ts`, absent from application exports/configuration. No environment variable can extend the application deadline. Invalid structured output/authentication failures are not retried.
- Attempts: claims increment actual processing attempts, capped at three. A caught third failure or stale third claim becomes terminal `failed/ATTEMPTS_EXHAUSTED`, unsorted; automatic fourth claims fail. Earlier failures remain recoverable. Post-redaction validation uses safe parsing to avoid poison-row throws.
- Retry: existing reservations/sales/GM roles only, Zod input, exact failed timestamp/attempt generation, new/unowned/untouched row and row lock. Reset and actor audit (`edited`, `ai:failed` → `ai:pending:retry`) commit together. Other edits remain protected. Stale requests cannot override success. `/admin/inbox` has pending/result feedback and a bounded unsorted queue.
- Recovery: ingest `after()`, inbox load and existing daily cron all use bounded batch claims with `FOR UPDATE SKIP LOCKED`. Up to five workers and five stale-exhaustion transitions per sweep; no transaction spans inference. Each worker retains its original attempt/timestamp generation.
- Cron: existing `CRON_SECRET` bearer validation, strict query schema and hold-expiry behavior retained. Same daily 00:00 UTC / 05:30 IST schedule; `maxDuration=60` verified in build manifest. Recovery failure is sanitized independently of hold expiry. No cron was invoked against any database.

Authorization/orchestration unit tests and all **17 real PostgreSQL queue tests pass**. They cover concurrent SKIP LOCKED sweeps, the three-attempt cap, successful attempts one/two/three, stale final-claim exhaustion, atomic actor-audited concurrent Retry, stale Retry/settlement rejection, the exact two-minute threshold, duplicate settlement, metadata preservation, draft/notification rollback faults and protection of staff edits. Hosting termination or slow database work may still interrupt a batch; persisted recovery remains the safety mechanism.

## 6. Draft quality and safety

Saved-output replay uses all 30 unchanged seed cases, 240 archived samples across the two full suites and both models; no fresh inference or architecture change. See `r1-r4-draft-guard-evaluation.md` and per-sample/hash evidence in `r1-r4-draft-guard-replay.json`.

| Suite/model | Before → after template fallback |
|---|---|
| Baseline Qwen3, 30 | 73.3% → 63.3% |
| Baseline Qwen2.5, 30 | 83.3% → 80.0% |
| Controlled Qwen3, 90 | 72.2% → 67.8% |
| Controlled Qwen2.5, 90 | 66.7% → 62.2% |

Under 30% remains unmet. Author review found zero remaining unsupported financial, availability or booking commitments in accepted replay prose; this is limited saved-output evidence, not independent certification. Compound refund and budget promises discovered during replay were fixed and regression-tested. Known harmless rejections include partially extracted event duration/month-name dates; examples and limitations are recorded in the evaluation document. Hindi confirmations/prices, Devanagari digits, currency variants, refund promises, English availability promises, invalid tokens, invented numeric facts and guest-perspective prose have explicit regressions. Guard validation still occurs **before** server price substitution. All drafts remain unapproved and unsent.

## 7. PII improvements and limits

Supported: precise known/introduced name tokens, Regards/Thanks/Warm regards and common sign-offs with name lines, existing emails/mobiles, STD/eight-or-more-digit landlines, PIN-bearing address segments, forwarded headers and common identifiers. Date/count protection preserves neighboring booking/event facts and prevents a phone scan from swallowing the next adult count. Provider payload and sanitized diagnostic assertions cover these cases.

Pattern minimization is not perfect: arbitrary unintroduced names, addresses without recognized cues/PIN, spelled-out or unusual phone formats and novel identifiers may remain. No claim of universal entity recognition or completed H2 privacy assurance is made.

## 8. Validation results and isolation

| Command | Final result |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` | PASS: 49 files, 433 passed, 0 failed |
| `pnpm build` | PASS: includes staff queue and 60-second cron/inbound duration exports |
| `pnpm exec tsx --tsconfig tsconfig.json tests/benchmarks/ollama/replay-draft-guard.mts` | PASS: unchanged saved inputs; metrics above |
| `git diff --check` | PASS |
| Scoped Prettier | Raw folder check flags pre-existing `enquiries/fixtures.ts`; remediation code checked separately, no unrelated fixture edit |
| PostgreSQL integration | PASS: 34/34, two files, 382.24 seconds; confirmed isolated TEST_DATABASE_URL only |
| Read-only post-test fixture check | PASS: zero enquiries, drafts, events, notifications, users, rooms and tax slabs remain |

Initial sandboxed Vitest startup hit Windows `spawn EPERM`; rerunning with authorized subprocess access passed. No provider keys, URLs or raw contacts were printed. No live provider calls were made. After explicit isolation confirmation, only existing migrations were applied to the initially empty isolated database. No seed, reset, new migration or shared-database write occurred. Test GST rows are owned and removed by the suite, avoiding an assumption that the isolated branch is already seeded.

Executed after the scrum master's explicit isolation confirmation; JSON evidence is `r1-r4-postgres-remediation.json` (17 routing and 17 queue tests, all passed). Reproduction requires an isolated test target:

```powershell
pnpm exec tsx --env-file-if-exists=.env.local scripts/ai-preflight.mts
pnpm exec tsx --tsconfig tsconfig.json --env-file-if-exists=.env.local tests/integration/prepare-ai-tests.mts
pnpm exec vitest run --config vitest.postgres.config.mts tests/integration/ai-processing.test.ts tests/integration/ai-routing.test.ts --reporter=verbose --reporter=json --outputFile.json=docs/reviews/r1-r4-postgres-remediation.json
pnpm exec tsx --tsconfig tsconfig.json --env-file-if-exists=.env.local tests/integration/prepare-ai-tests.mts --check
```

The existing guard distinguishes development/protected endpoints from the test target; exclusive isolation was confirmed by the scrum master before execution. Only the focused AI suite was run in this follow-up; the broader booking integration suite was not rerun. Staff UI was compiled but not browser-tested; server Retry authorization and database audit/race behavior have separate passing tests.

## 9. Remaining release risks and review focus

1. Review the passing PostgreSQL evidence for third-failure terminalization, atomic Retry audit, concurrent sweeps/claims, stale settlement, source metadata and mixed-intent notification deduplication. The broader booking integration suite was not part of this focused rerun.
2. Independent Claude re-audit must inspect the **final** source checkpoint, including final regression corrections, for B1, M1 and M5.
3. M6's quality target is unmet; patterns retain known false positives and cannot prove safety for every language/paraphrase. No protection was relaxed to improve the rate.
4. Review later main changes separately after audit. This branch intentionally contains no merge/rebase of the 25 separately advanced main commits.
5. Existing no-GM-account, hosting interruption, unsupported-format, privacy-pattern and live-provider readiness limitations remain documented. Actual staff Retry UI behavior should be verified on the isolated environment.

Diff verification confirms **no changes** to `src/db/**`, `src/modules/{booking,pricing,inventory,payments}/**`. No edits were made to Claude's branch/worktrees. No drafts were sent, no provider switched, no production model request split, and nothing was pushed, merged or deployed. Work stops after this report for independent re-audit.
