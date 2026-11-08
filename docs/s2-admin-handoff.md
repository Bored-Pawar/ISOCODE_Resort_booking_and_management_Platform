# S2 admin and RBAC handoff (A1 to A4, permissions)

Branch `claude/admin` from `origin/main` `444840d` (Merge PR #5). Runbook: `s2-admin-rbac-runbook.md`.
Resume from this file and `git log main..HEAD`.

## Baseline (before any change, 2026-11-08 21:53 IST)
typecheck pass · lint pass · unit 285/285 (42 files) · build pass. Integration not run at baseline.
DB guard: `TEST_DATABASE_URL` host differs from Codex's test host and from both dev hosts (hosts compared only).

## Status
| Item | State | Commit |
|---|---|---|
| Setup, locks row in `06` | done | d1f48de |
| 2.1 `permissions.ts` (table, `can`, `requirePermission`, `navFor`), A5 on `bookings.view` | done | 083b107 |
| 2.3 R06 DataGrid: pure editor (`data-grid-editor.ts`), pending stable, errors caught, stale completions ignored | done | 791f230 |
| 2.5 A1 `/admin/rates`: grid, cell edit, bulk panel with presets and preview, `pricing/admin.ts` `setRates` | done | bbe961c |
| 2.6 A2 `/admin/allotment`: grid (allotment, sold · held), cell and bulk, `inventory/admin.ts` `setAllotment`, rejected cells red with reason; test 6 final | done | 185864d |
| 2.7 A3 online dates on `/admin/allotment`: offline with reason (merge), online (delete/trim/split), warning list first, hatched cells | done | c2b757b |
| 2.2 Staff shell: nav from `navFor`, `/admin` per role (`overviewFor`), 403 screen on direct URLs incl. A5 (`PageGate`) | done | f3decb9 |
| 2.4 `enquiryVisibility`, `canSeeEnquiry` (tested); Codex inbox lines and attention-request decision in `06` | done | be7a06e |
| 2.8 A4 `/admin/promos`: list, create (uppercase, no case-only duplicates), switch off | done | 5c216d7 |
| 4 Chrome walkthrough (sales, gm, reservations; desktop and 375px), 375px fix, docs 01/02/07/tdd-notes | done | 62428e0 |
| 4 Review fix, major 1: blackout edits serialised by one advisory lock (+ concurrency test) | done | 72ee70c |
| 5 Final gates, dev reseed, PR | done | (this commit) |

Last finished: hand off. Next: scrum master review of the PR; Codex wires the inbox to `permissions.ts` (see `06`).

## Audit fix (2026-11-09, report `docs/reviews/s2-admin-rbac-implementation-audit.md`, reviewed fa21e36)
Verdict FIX MAJORS: 0 blockers, 3 majors. Scrum master decisions approved in the assignment (incl. the additive booking read for M03).
| Item | State | Commit |
|---|---|---|
| Audit report copied into `docs/reviews/` | done | c828d79 |
| 0 Merge `origin/main` 9c62b7a (PR #6, R1 to R4): conflicts in `02` (kept both) and the staff layout (kept `navFor`; added "Unsorted enquiries" `/admin/inbox` for every staff role, matching its page guard). Gates: typecheck, lint, unit 621/621 (63 files), build pass | done | 4b1fa3c |

## Review (independent subagent, no context: runbook, `01`, `git diff main...HEAD`)
No blockers. Major 1: a concurrent offline and online edit on the same blackout could lose the online part (one merged the row away while the other's `FOR UPDATE` skipped it). Fixed: `pg_advisory_xact_lock` first in `setOffline` and `setOnline`; holds never take it. Checked and found correct: permission on every entry point, stock invariants, lock order with holds, Zod, paise, window, parameterised SQL.

## Gates (latest, at 72ee70c)
typecheck, lint, `format:check` (raw), build: pass. Unit 420/420 (48 files).
Integration on test-claude: full run 118/119 (16 files, before the review fix; the 1 is the HOLD_MINUTES timeout below, passes alone). New admin files: `admin-rates` 8, `admin-allotment` 9 (race repeated 5x), `admin-availability` 7, `admin-promos` 8, all pass.
Chrome (Playwright, installed Chrome) as sales, gm, reservations at desktop and 375px: see `tdd-notes.md`; screenshots `docs/screenshots/{a1,a2,a3,a4,rbac}-*`. Dev DB reseeded afterwards.

## Deviations
1. `main` is checked out in another worktree, so the branch was cut from `origin/main` instead of `git switch main`.
2. New file `src/components/ui/data-grid-editor.ts` (+ test) next to the locked `data-grid.tsx`: the R06 rules as a pure module, because no DOM test library is installed (same pattern as `hold-latch.ts`).
3. Shared admin files outside the listed paths but inside `(app)`: `_lib/access.ts` (`staffPage`, `actionActor`), `_components/forbidden.tsx`, `_components/grid-dates.tsx`.
4. UI reaches `pricing/admin.ts` and `inventory/admin.ts` only through `@/modules/admin`; client components import the pure `@/modules/admin/rules` and `/schemas` (no DB code).
6. A5 pages (`bookings/page.tsx`, `bookings/[ref]/page.tsx`) are wrapped in `PageGate` so sales sees the 403 screen instead of a 404 (runbook 2.2); loaders unchanged.
5. 403 is a rendered screen, not an HTTP 403: the staff layout streams inside `<Suspense>`, so the status is already sent. Actions return `FORBIDDEN`.

## Open items
1. A3 warning list reads `booking.listForStaff` (public contract): it looks back 60 days for stays that began before the range and at most 200 per status.
3. Flaky on Neon latency, not this branch: `booking.test.ts` "honours HOLD_MINUTES" can exceed the 30 s test timeout in a full run.
2. A room type cannot be brought online inside an all-rooms blackout (`ALL_ROOMS_OFFLINE`, nothing changes); bring all rooms online for those dates first.
