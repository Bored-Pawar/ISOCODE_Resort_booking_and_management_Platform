# S3 overnight handoff

Runbook: `docs/s3-overnight-final-runbook.md`. Resume: read this file, then `git log --oneline -15 origin/main` and the phase branch named below.
Worktrees: Phase 1 and 3 in `../resort-inbox`, Phase 2 in `../resort-claude`. Memory: integration only with `--no-file-parallelism`, dev servers stopped, one heavy job at a time.
**Integration runs must be prefixed `AI_PROVIDER=rules`**: `.env.local` now has `AI_PROVIDER=groq` (keys present), and shell env wins over the file, so this keeps tests off the live API.

## Phase status
| Phase | Branch | State | Merge SHA on main |
|---|---|---|---|
| 0 Groq failover | claude/s3-groq | merged (code in `modules/ai-provider`, not `ai-router/provider.ts`) | 2a482cb |
| 1 Inbox | claude/inbox | merged after review (3 majors fixed) and recheck (0/0) | 4f3a74a |
| 2 Polish and security | claude/s3-polish | merged after 1 review + 4 rechecks of the rate limiter (majors and 2 blockers fixed) | 8c300e6 |
| 3 AI eval R5 | claude/s3-eval | merged after review (1 major, wording) and recheck (0/0); includes the Groq strict-schema fix | 1536067 |
| 4 Performance H3 | claude/s3-perf | merged after review (1 major, after-batch) and recheck (0/0); LCP still over 2.5 s | 997e9e8 |
| 5 UX H4 H5 | claude/s3-ux | in review recheck (2 majors fixed) | |
| 6 Verify | claude/s3-verify | todo (after Phase 5 merges) | |
| 7 Deploy prep | claude/s3-deploy-prep | merged after review (0/0, doc minors fixed); merged before 6 so verify covers it | b8b589f |
| 8 TDD pack | claude/s3-tdd-pack | drafting (subagent writing `docs/tdd-material.md`) | |
| 9 Wrap up | main | todo | |

## Last done
Phase 7 merged. Phase 5 walk: 72 checks, 0 findings after fixes; hydration 0; keyboard booking start ok. Usage limit hit around 08:00 and reset at 09:00 IST; the Phase 5 review was resumed.

## Next
Phase 5 merge on a clean recheck, then Phase 6 on `claude/s3-verify` from main: reseed dev DB, full integration file by file (`AI_PROVIDER=rules`), unit, build, Playwright (booking, inbox, headers) on `pnpm dev`, acceptance walk, the three brief enquiries, `docs/final-check.md`. Then fill Phase 8 counts, Phase 9.

## Gates (last run)
- Phase 0: unit 639/639, build ok. Phase 1: unit 703/703; integration inbox 18/18, ai-processing 17/17, ai-routing 17/17. Phase 2: unit 728/728; integration auth 4/4; e2e headers 4/4. Phase 3: unit 730/730 (merged result); integration ai-routing 17/17, ai-processing 17/17. Phase 4: unit 730/730, build ok. Phase 5: unit 730/730, build ok. Phase 7: unit 735/735, build ok.

## Open items
- Inbox minors left open: keyset cursor millisecond precision; reservations keep read access after an attention request is seen (decided 2026-11-08); no index on `enquiry_events.enquiry_id` / `received_at`, summary search ILIKE on jsonb (needs a migration); a stale-draft refusal discards the sender's unsaved text; a failed rebuild after a field edit leaves the old-priced draft sendable (staff are told to Regenerate).
- Rate limits are per instance and in memory; the email-only login window (50) can still be exhausted by a distributed attacker. A shared store is the production step.
- CSP allows `'unsafe-inline'` scripts (no nonces, to keep partial prerendering).
- Groq: 9/30 answers fail Zod and go to unsorted; options are a Groq-friendly schema (all fields required, nullable) or `openai/gpt-oss-120b`.
