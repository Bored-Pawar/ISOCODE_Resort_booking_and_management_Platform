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
Phase 1: main merged into claude/inbox (cbe521f). test-claude had 0 leftover fixture rows (users `inbox-*`, `ENQ-T*`), nothing deleted; Codex uses a different test DB. Overview counts wired (faa0e7f): `inbox.counts(actor, lanes)` cut to `lanesFor(role)`, one query per page, rows link to the inbox lane. Review subagent running.

## Next
Phase 1: act on the review, merge into main. Then Phase 2.

## Gates (last run)
Phase 0 on claude/s3-groq: typecheck, lint, format:check, unit 639/639, build ok.
Phase 1 on claude/inbox (faa0e7f, main merged): typecheck, lint, format:check, build ok; unit 698/698 (70 files); integration on test-claude, one file at a time: inbox 16/16 (includes the review-fix "sending unsaved edits"), ai-processing 17/17, ai-routing 17/17.

## Open items
- None yet.
