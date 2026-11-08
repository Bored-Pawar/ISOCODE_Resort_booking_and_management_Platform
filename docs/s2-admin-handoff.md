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
| 2.5 A1 `/admin/rates`: grid, cell edit, bulk panel with presets and preview, `pricing/admin.ts` `setRates` | done | (this commit) |

Last finished: 2.5. Next: 2.6 A2 allotment.

## Gates (latest)
After 2.5: typecheck, lint pass; unit 386/386 (47 files); integration `admin-rates` 8/8 on test-claude.

## Deviations
1. `main` is checked out in another worktree, so the branch was cut from `origin/main` instead of `git switch main`.
2. New file `src/components/ui/data-grid-editor.ts` (+ test) next to the locked `data-grid.tsx`: the R06 rules as a pure module, because no DOM test library is installed (same pattern as `hold-latch.ts`).
3. Shared admin files outside the listed paths but inside `(app)`: `_lib/access.ts` (`staffPage`, `actionActor`), `_components/forbidden.tsx`, `_components/grid-dates.tsx`.
4. UI reaches `pricing/admin.ts` and `inventory/admin.ts` only through `@/modules/admin`; client components import the pure `@/modules/admin/rules` and `/schemas` (no DB code).
5. 403 is a rendered screen, not an HTTP 403: the staff layout streams inside `<Suspense>`, so the status is already sent. Actions return `FORBIDDEN`.

## Open items
None yet.
