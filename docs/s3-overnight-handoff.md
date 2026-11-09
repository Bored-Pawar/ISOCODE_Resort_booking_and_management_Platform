# S3 overnight handoff

Runbook: `docs/s3-overnight-final-runbook.md`. Resume: read this file, then `git log --oneline -15 origin/main` and the phase branch named below.
Worktrees: Phase 1 and 3 in `../resort-inbox`, Phase 2 in `../resort-claude`. Memory: integration only with `--no-file-parallelism`, dev servers stopped, one heavy job at a time.
**Integration runs must be prefixed `AI_PROVIDER=rules`**: `.env.local` now has `AI_PROVIDER=groq` (keys present), and shell env wins over the file, so this keeps tests off the live API.

## Phase status
| Phase | Branch | State | Merge SHA on main |
|---|---|---|---|
| 0 Groq failover | claude/s3-groq | merged (code in `modules/ai-provider`, not `ai-router/provider.ts`) | 2a482cb |
| 1 Inbox | claude/inbox | merged after review (3 majors fixed) and recheck (0/0) | 4f3a74a |
| 2 Polish and security | claude/s3-polish | gates green; third limiter recheck running | |
| 3 AI eval R5 | claude/s3-eval | gates green; review running | |
| 4 Performance H3 | claude/s3-perf | todo | |
| 5 UX H4 H5 | claude/s3-ux | todo | |
| 6 Verify | claude/s3-verify | todo | |
| 7 Deploy prep | claude/s3-deploy-prep | todo | |
| 8 TDD pack | claude/s3-tdd-pack | todo | |
| 9 Wrap up | main | todo | |

## Last done
- Phase 1: test-claude had 0 leftover fixture rows. Overview counts from `inbox.counts(actor, lanes)`. Review fixes: single-field re-quote keeps the price, draft version (`STALE_DRAFT`), `safeError()` logging everywhere.
- Phase 2: forms keep input (`attempt` key), favicon, CSP and headers (e2e `headers.spec.ts` 4/4 on `pnpm start`), rate limits. The limiter went through three review rounds: (1) lockout and eviction majors, (2) a race major, (3) a refund blocker via `X-Auth-Return-Redirect`. Now every login attempt is charged before the password check and never refunded. Secret scan of tree and history clean. `codex/polish` does not exist.
- Phase 3: the first Groq run found HTTP 400 on every call (strict json_schema). Fixed by sending Groq non-strict (Zod unchanged). R5: complaint recall 100 percent (rules and Groq), Groq model accuracy 67 percent, 9/30 Zod failures fall back to rules. `docs/eval/r5-results.md`.

## Next
Merge Phase 2 and 3 when their reviews have no blockers or majors, then Phase 4 (perf) from the new main.

## Gates (last run)
- Phase 0 (claude/s3-groq): typecheck, lint, format:check, unit 639/639, build ok.
- Phase 1 (claude/inbox, merged tree = 4f3a74a): typecheck, lint, format:check, build ok; unit 703/703; integration on test-claude one file at a time: inbox 18/18, ai-processing 17/17, ai-routing 17/17.
- Phase 2 (claude/s3-polish): typecheck, lint, format:check, build ok; unit 726/726; integration auth 4/4; e2e headers 4/4 against `pnpm start`.
- Phase 3 (claude/s3-eval): typecheck, lint, format:check, build ok; unit 704/704; integration ai-routing 17/17, ai-processing 17/17 (AI_PROVIDER=rules); eval rules 30 cases, Groq 30 cases.

## Open items
- Inbox minors left open: keyset cursor millisecond precision; reservations keep read access after an attention request is seen (decided 2026-11-08); no index on `enquiry_events.enquiry_id` / `received_at`, summary search ILIKE on jsonb (needs a migration); a stale-draft refusal discards the sender's unsaved text; a failed rebuild after a field edit leaves the old-priced draft sendable (staff are told to Regenerate).
- Rate limits are per instance and in memory; the email-only login window (50) can still be exhausted by a distributed attacker. A shared store is the production step.
- CSP allows `'unsafe-inline'` scripts (no nonces, to keep partial prerendering).
- Groq: 9/30 answers fail Zod and go to unsorted; options are a Groq-friendly schema (all fields required, nullable) or `openai/gpt-oss-120b`.
