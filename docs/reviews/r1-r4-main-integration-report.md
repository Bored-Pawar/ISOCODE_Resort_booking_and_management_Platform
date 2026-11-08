# R1–R4 integration with main

Integration date: 8 November 2026 (IST). Branch: `codex/r1-r4-ai-routing`.

**Ready for a pull request.** Typecheck, lint, production build, 486 unit tests and all 122 PostgreSQL integration tests pass. There are zero test failures or skips. The reviewed remediation remains intact; protected business logic matches main exactly.

## Verified inputs and history

| Item                      | Commit / evidence                          |
| ------------------------- | ------------------------------------------ |
| Clean initial branch HEAD | `87e20d8a037c4080b1c39819f5a2ca0d3e56e7f8` |
| Common merge base         | `e1e3d92d80ccfa6b2e89dd4fd23166bde11ba944` |
| Fetched `origin/main`     | `444840d70468143629410c7407eb0fa03790d247` |
| Booking PR #5 merge       | `444840d70468143629410c7407eb0fa03790d247` |
| Integration merge         | `4118484629a2bf9d790d30802a7021651a2aaef5` |

[Booking PR #5](https://github.com/Bored-Pawar/ISOCODE_Resort_booking_and_management_Platform/pull/5) was verified through GitHub's API as merged into `main` at 2026-11-08 16:07:48 UTC (21:37:48 IST). A fresh fetch confirmed its merge commit is an ancestor of, and currently equals, `origin/main`.

Before integration, the branch was clean in its own `resort-codex` worktree. The common base has 21 AI-branch commits and 25 main commits after it. A normal two-parent merge preserves reviewed and actively referenced commits; there was no rebase or force-push. Work remained on the assigned branch.

The merge's first parent is the initial AI HEAD and its second parent is the verified PR #5/main commit above. A final post-test fetch again returned `444840d70468143629410c7407eb0fa03790d247`; the merged application checkpoint therefore contains the current fetched main. The reporting follow-up changes documentation only.

## Conflicts and review of automatic merges

Only `src/app/(staff)/admin/(app)/layout.tsx` conflicted, in the icon imports and navigation declaration. The resolution retains Overview and Unsorted enquiries for authenticated staff and adds main's Bookings entry only for `BOOKING_STAFF_ROLES` (reservations and GM). Sales retains inbox access without booking authority. The existing request-time authentication and Suspense boundary remain intact.

`docs/06-progress.md` merged automatically. Both complete histories, main's current locks and approved booking decisions were retained; a new Codex integration entry records this work without rewriting Claude's historical rows. `docs/02-architecture.md` and `docs/tdd-notes.md` also merged automatically, retaining AI recovery documentation alongside the payment webhook and booking notes.

`package.json` and `pnpm-lock.yaml` merged automatically, retaining AI SDK dependencies and `eval:ai` alongside booking's Playwright dependency and `test:e2e`. `pnpm install --frozen-lockfile` passed without changing the merged lockfile. Shared fixture/race changes from PR #5 were retained exactly. No tests or assertions were weakened for this integration.

The production build includes `/admin/bookings`, `/admin/inbox`, `/book/details`, `/book/pay/[ref]`, booking confirmation/email/calendar, the payment webhook, inbound routes and hold-expiry/AI-recovery cron together. Route composition has no duplicate-path build error. No guest-only three-month booking restriction was added to enquiry quotes; A10 explicitly exempts enquiries and service contracts.

## B1/M1–M7 and R4 verification

All `src/modules/ai-provider/**`, `ai-router/**`, `enquiries/**` and both AI PostgreSQL test files are byte-for-byte unchanged from the reviewed pre-integration HEAD. This preserves:

- B1 original-text grounding and conservative date/count rejection before stock/pricing reads.
- M1 original-text room preferences, named villa restrictions and multilingual aliases.
- M2 fixed 10-second application attempts, one bounded transient retry and HTTP abort propagation.
- M3 persisted three-attempt cap, terminal failure and staff-authorized generation-safe Retry.
- M4 lazy and daily bounded recovery with generation checks.
- M5 complaint detection independent of classification and owner, with atomic GM alert deduplication.
- M6 multilingual price/commitment/numeric guard and safe template fallback.
- M7 redacted provider payloads and documented PII pattern limitations.

R4 imports only public catalog, inventory and pricing entry points. It still calls `pricing.quote({ checkIn, checkOut, rooms: [...] })` using the current B10 contract, with 1–4 room lines, server-computed integer-paise/GST snapshots and the unchanged public quote shape saved on drafts. `roomNames` is prose context, not an extra saved pricing field. Main changes only an internal batched promo lookup in pricing; the public pricing types and `index.ts` contract are unchanged.

Availability comes from public `inventory.availability`, which retains booking-owned scoped lazy expiry and minimum website stock across all requested nights. R4 excludes sold-out and blacked-out results, caps repeated type demand to available units, enforces room occupancy, and never substitutes unrelated rooms for an unavailable named villa. Existing unit coverage exercises these restrictions, multilingual aliases, missing rates and unsupported-input pricing spies. The real PostgreSQL villa case compares its saved quote exactly to a fresh public quote, including GST; the multi-room case proves stock reduction prevents a quote.

`src/db/**` and `src/modules/{booking,payments,inventory,pricing}/**` match `origin/main` exactly. No protected business logic, public contract, migration or seed source was edited to accommodate AI tests.

## Validation

| Check                                                 | Result                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| Pre-integration `pnpm test`                           | PASS: 433 tests, 49 files                                                  |
| `pnpm install --frozen-lockfile`                      | PASS; merged lockfile unchanged                                            |
| `pnpm typecheck`                                      | PASS                                                                       |
| `pnpm lint`                                           | PASS                                                                       |
| Post-integration full `pnpm test`                     | PASS: 486 tests, 57 files; zero failed                                     |
| `pnpm build`                                          | PASS, all combined routes compiled/prerendered                             |
| PostgreSQL integration, non-seed                      | PASS: 115 tests, 13 files, 1963.23 s                                       |
| PostgreSQL integration, seed last                     | PASS: 7 tests, 1 file, 39.40 s                                             |
| PostgreSQL aggregate                                  | PASS: 122 tests, 14 files; zero failed/skipped                             |
| Before-seed fixture cleanup                           | PASS: all checked application counts zero; no duplicate GST slabs          |
| After-seed endpoint/data check                        | PASS: same isolated endpoint, expected demo counts, no duplicate GST slabs |
| Prettier: resolved layout and package manifest        | PASS                                                                       |
| Integration-only `git diff --check` (`87e20d8..HEAD`) | PASS                                                                       |
| Full PR whitespace check                              | 11 pre-existing benchmark-evidence warnings; all other paths pass          |
| Secret and protected-source diff review               | PASS; details below                                                        |

The initial sandboxed unit startup failed with Windows `spawn EPERM`; it passed with authorized subprocess access. Git metadata lives outside this worktree, so fetch, index updates and commits require the same filesystem elevation. The initial restricted dependency install also failed to open pnpm's external store lock; the elevated frozen-lockfile install passed. A final GitHub fetch hit a transient DNS error; its retry succeeded and confirmed unchanged main. These are environment permission/network failures, not test assertion failures. Both PostgreSQL invocations passed on their first attempt, with no test retry or source adjustment.

### PostgreSQL target and execution

The guarded read-only preflight used the previously confirmed Codex-isolated `TEST_DATABASE_URL` only. Repository guards rejected development/protected endpoints; the target was PostgreSQL 18.6 on Neon, with the 20 existing public tables, zero application fixtures, no duplicate GST slabs and no other active database sessions. The normalized test-host SHA-256 is `8f389370bba3b7d47d1558a968cb8feb0e8db5b06b01f5d816e39e389f5e38de`; later checks compare this fingerprint without printing credentials or hostnames. The older booking handoff's shared-test-URL note is historical; this run uses the replacement isolated target confirmed during remediation validation.

Tests used the existing serial remote-PostgreSQL profile. The seed test ran last in a separate invocation because it truncates and reseeds its target, whereas the other suites own and remove their fixtures. Together the invocations covered every integration file, with zero skipped or pending tests. No new migration, manual reset or seed-source edit was involved. Development and production were not targets. No live model provider, outbound message, cron request, deployment or application-server browser test was invoked.

After the 115 non-seed cases, a same-endpoint read-only check found zero enquiries, drafts, events, notifications, users, rooms, GST slabs, bookings and payments. The seed suite then ran the existing guarded seed twice to prove idempotency. Its seven assertions verified catalog/allotment, occupancy, status-to-inventory reconciliation, nightly/order totals and frozen quote hashes. The final read-only check found the expected demo data: 5 users, 4 room types, 2 GST slabs, 30 bookings, 21 payments, 30 enquiries, 0 drafts, 29 enquiry events and 9 notifications, with no duplicate slabs. This intentional synthetic seed remains only on the isolated test branch; no separate cleanup/reset was performed after the seed verification.

```powershell
pnpm exec vitest run --config vitest.postgres.config.mts --exclude tests/integration/seed.test.ts --reporter=verbose --reporter=json --outputFile.json=.tmp-r1-r4-integration/postgres.json
pnpm exec vitest run --config vitest.postgres.config.mts tests/integration/seed.test.ts --reporter=verbose --reporter=json --outputFile.json=.tmp-r1-r4-integration/seed.json
```

| PostgreSQL file            |  Passed |
| -------------------------- | ------: |
| `ai-processing.test.ts`    |      17 |
| `ai-routing.test.ts`       |      17 |
| `auth.test.ts`             |       4 |
| `booking-list.test.ts`     |       3 |
| `booking.test.ts`          |      28 |
| `cancel.test.ts`           |       6 |
| `hold-idempotency.test.ts` |       5 |
| `inventory.test.ts`        |      12 |
| `list-query-depth.test.ts` |       1 |
| `multiroom.test.ts`        |       9 |
| `pricing.test.ts`          |       6 |
| `schema.test.ts`           |       5 |
| `seed.test.ts`             |       7 |
| `staff-read.test.ts`       |       2 |
| **Total**                  | **122** |

### Comparison with 467 baseline

The prior remediation baseline was **433 unit + 34 focused AI PostgreSQL = 467 passing**. The fresh pre-integration unit run reproduced 433. After merging PR #5, the unit count is **486**, an increase of **53** matching main's increase from 232 to 285. All 34 prior AI PostgreSQL assertion names are present and passing; an automated name-set comparison found no missing baseline AI case.

The directly comparable result is **486 + 34 = 520 passing**, up **53** from 467. The broader result is **486 + 122 = 608 passing**, up **141**, including **88 additional existing booking/database integration cases** outside the earlier focused remediation baseline. Those 88 represent expanded validation, not newly authored AI tests. No remediation test was removed or weakened.

## Final diff and artifact review

The integration imports main's changes plus the single combined-navigation resolution. The reviewed AI source and existing audit/benchmark evidence were preserved. The historical architecture audit SHA-256 remains `3f46f2a33423366b77c1ab16d3f3472ff9fa740b4cc9c4cc331312cd93d64bfc`.

The PR diff was scanned for exact configured secret values/database passwords, credential-bearing PostgreSQL URLs, private keys and common provider/GitHub token formats: zero matches. No `.env.local`, database credentials, temporary SQL watcher, build output, machine-specific test JSON or newly generated benchmark output is staged. New command evidence stays in ignored `.tmp-r1-r4-integration/`. The branch already contained 110 intentional benchmark harness/evidence files relative to main; these are historical inputs to the completed audit/remediation and were neither regenerated nor silently removed. The original benchmark preservation commit is `0f2ce67`.

The full `origin/main..HEAD` whitespace check reports ten trailing-space headers in historical `docs/reviews/ollama-benchmark/**/qwen*-ps-after.txt` captures and one blank line at EOF in `docs/reviews/r1-r4-ollama-model-benchmark.md`. These files are unchanged from the initial reviewed HEAD; the raw captures were preserved as evidence. The integration-only diff passes, and the full PR diff excluding these preserved benchmark artifacts also passes. This cosmetic exception is disclosed rather than reported as a clean full-PR whitespace gate.

## Remaining issues and PR preparation

- No new integration blocker remains. All requested validation gates passed.
- Full-PR whitespace warnings remain in the 11 unchanged benchmark-evidence locations above; they do not affect application behavior or test results.
- The accepted M6 quality limitation remains: saved-output draft template fallback was 67.8% for controlled Qwen3 and 62.2% for Qwen2.5, above the under-30% target. Safety protections were not relaxed.
- Existing documented live-provider, privacy-pattern, no-GM-account and hosting-interruption limitations remain. This run does not claim new live-model or browser/E2E validation.
- Main's documented booking limitations remain unchanged, including refresh-hold stock races, zero-total payments and mock-email behavior.

The normal integration merge is committed locally, and this report plus the Codex progress entry form a documentation-only follow-up. Suggested PR title: **Integrate reviewed R1–R4 AI routing and audit remediation**. Target: `main`; source: `codex/r1-r4-ai-routing`.

**PR readiness at the 8 November preparation checkpoint: ready for submission**, with the existing limitations above disclosed. No push, PR submission, merge into `main` or deployment had been performed at that checkpoint.

## Authorized publication (9 November 2026)

The project owner subsequently authorized pushing and merging if safe. A fresh check confirmed clean source HEAD `f002d106e7db3caaefeea2ffe1376888c0bf05de`, unchanged main `444840d70468143629410c7407eb0fa03790d247`, no changes to reviewed remediation/protected source and a clean secret/artifact audit. The branch was pushed normally and [PR #6](https://github.com/Bored-Pawar/ISOCODE_Resort_booking_and_management_Platform/pull/6) opened into `main` with the full validation summary and known limitations.

This publication follow-up changes only this report and Codex's progress entry. The tested application source and 608 passing tests above remain applicable. GitHub CI additionally runs the static/unit/build checks and the integration suite against its disposable PostgreSQL 16 service; it does not use a shared Neon endpoint. The merge uses GitHub's normal merge method with the exact PR HEAD pinned, checks green and main unchanged from the validated base. GitHub's PR merge record is the source of truth for the final main merge SHA. No force-push or deployment is included.
