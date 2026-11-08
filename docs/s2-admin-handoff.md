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
| 2.3 R06 DataGrid: pure editor (`data-grid-editor.ts`), pending stable, errors caught, stale completions ignored | done | (this commit) |

Last finished: 2.3. Next: 2.5 A1 rates.

## Gates (latest)
Baseline only.

## Deviations
1. `main` is checked out in another worktree, so the branch was cut from `origin/main` instead of `git switch main`.
2. New file `src/components/ui/data-grid-editor.ts` (+ test) next to the locked `data-grid.tsx`: the R06 rules as a pure module, because no DOM test library is installed (same pattern as `hold-latch.ts`).

## Open items
None yet.
