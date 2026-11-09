# S3 overnight handoff

Runbook: `docs/s3-overnight-final-runbook.md`. Resume: read this file, then `git log --oneline -15 origin/main` and the phase branch.
Worktree: `../resort-inbox`. Memory: integration only with `--no-file-parallelism`, dev servers stopped, one heavy job at a time.

## Phase status
| Phase | Branch | State | Merge SHA on main |
|---|---|---|---|
| 0 Groq failover | claude/s3-groq | merged (code lives in `modules/ai-provider`, not `ai-router/provider.ts`) | 2a482cb |
| 1 Inbox | claude/inbox | in progress | |
| 2 Polish and security | claude/s3-polish | todo | |
| 3 AI eval R5 | claude/s3-eval | todo | |
| 4 Performance H3 | claude/s3-perf | todo | |
| 5 UX H4 H5 | claude/s3-ux | todo | |
| 6 Verify | claude/s3-verify | todo | |
| 7 Deploy prep | claude/s3-deploy-prep | todo | |
| 8 TDD pack | claude/s3-tdd-pack | todo | |
| 9 Wrap up | main | todo | |

## Last done
Phase 1: main merged into claude/inbox (cbe521f). test-claude had 0 leftover fixture rows, nothing deleted; Codex uses a different test DB. Overview counts (faa0e7f). Review 1: 0 blockers, 3 majors, 7 minors. Fixed in da7e92d: majors 1 to 3 and minors 1, 3, 5, 7 (minor 2 cursor precision, 4 attention read access, 6 indexes left open). Recheck review running.
Phase 2 (in parallel, `../resort-claude` on claude/s3-polish, from claude/inbox at 4ff… before da7e92d): forms keep input, rate limits, headers, favicon, review doc copied; secret scan of tree and history clean. Still to do: merge main after Phase 1, docs, `pnpm start` CSP check, console check.

## Next
Phase 1 merge when the recheck has no blockers or majors. Then Phase 2 finish and merge.

## Gates (last run)
Phase 0 on claude/s3-groq: typecheck, lint, format:check, unit 639/639, build ok.
Phase 1 on claude/inbox (da7e92d, main merged): typecheck, lint, format:check, build ok; unit 703/703 (72 files); integration on test-claude, one file at a time: inbox 18/18 (includes "sending unsaved edits" and the new stale draft tests), ai-processing 17/17, ai-routing 17/17.

## Open items
- Inbox review minors left open: keyset cursor is millisecond precision (rows in the same ms can be skipped across pages); reservations keep read access after an attention request is marked seen (as decided 2026-11-08); no index on `enquiry_events.enquiry_id` / `received_at`, summary search ILIKE on jsonb (needs a migration).
- A field edit still rebuilds over a draft another staff member edited (prices win over edits); the other editor now gets STALE_DRAFT instead of overwriting.
