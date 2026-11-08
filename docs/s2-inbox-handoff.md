# S2 inbox handoff (claude/inbox)

Runbook: `docs/s2-inbox-runbook.md`. Branch `claude/inbox` in `../resort-inbox`, from `main` at 7d8bfaf
(merge of claude/admin). The scrum master reassigned the runbook from Codex (`codex/inbox`) to Claude
(`claude/inbox`) on 2026-11-09; locks in the runbook apply to this branch.

## Resume
`git log --oneline main..claude/inbox`, then continue with "Next" below. One commit per item, push after each.

## Status
| Item | State | Commit |
|---|---|---|
| 0 Runbook | done | docs(inbox): S2 inbox runbook |
| 1 Nav: unsorted is GM only | done | fix(admin): unsorted enquiries nav, page and retry are GM only |
| 2.1 Q4 inbox list | done | feat(inbox): Q4 inbox lanes, filters and list |
| 2.2 Q5 detail and routing | done | feat(inbox): Q5 detail, field edits, re-route and Retry AI |
| 2.3 Q6 draft and send | done | feat(inbox): Q6 draft editor, approve and send to the mock outbox |
| 2.4 Q7 GM bell | done | feat(inbox): Q7 GM bell with unread count and mark read |
| 2.5 Sales attention request | done | feat(inbox): sales attention request and mark seen |
| 2.6 Q2 unified enquiry form | done | feat(enquire): one form with optional event fields (Q2 absorbs Q9) |
| Gates, review, screenshots, docs | done | test(inbox): H1 ..., docs(inbox): ..., fix(inbox): ... |
| Full PostgreSQL run | blocked | stopped by Claude Code for low system memory, no results |

Last done: wrap-up. Gates green; Playwright H1 staff path passes; Chrome walk-through 31/31 checks (desktop and
375px, reservations, sales, GM); screenshots `docs/screenshots/q2-*`, `q4-*`..`q7-*`; docs 06, tdd-notes, 04.
Review subagent (no context: runbook, 04, diff): 0 blockers, 1 major (unsaved edits sent without logging a
price warning) fixed in `fix(inbox): log the price warning when unsaved edits are sent`.
Next: rerun the full PostgreSQL suite when memory allows (stopped at ~04:30 for low system memory,
no results printed; a killed test may have left fixture rows: users `inbox-*@test.example`, enquiries
`ENQ-T*`, admin fixtures), then the review-fix test (`inbox.test.ts` "sending unsaved edits") on
test-claude, then the compare URL. Do not merge.

## Gates (last run)
typecheck, lint, format:check, build ok; unit 686/686 (69 files). `inbox.test.ts` 14/14 on test-claude before the
review fix. Full integration run started 03:48 at 39c3f0c (later commits change UI, docs and one send event).
E2E `e2e/inbox.spec.ts` 1/1 on `pnpm dev -p 3100` (dev DB). Dev DB now has extra simulated rows (ENQ-4411 replied,
ENQ-4410 attention, simulator rows); reseed (`pnpm db:seed`) before re-running the E2E.

## Open items / blockers
- One React hydration-attribute warning seen once during the Chrome run; not reproduced on any inbox, enquire,
  outbox, login or simulator page at either width (likely the dev server hot-reloading mid-run).
- `/admin` overview still shows enquiry counts as "Coming with the inbox" (`_lib/overview.ts`, an admin page,
  read only per the runbook locks). `inbox.counts` can feed it; needs scrum master OK.
- `enquiry_events` has no note column and no schema change is allowed: attention request stores the note in
  `from_value` (to_value `attention`); resolve stores `to_value = 'seen: <reply note>'` (from_value `attention`).
- No index on `enquiry_events.enquiry_id` and summary search is ILIKE on jsonb: lane/visibility use the indexed
  enquiries columns, but the attention EXISTS and search scan within them. Needs a migration later (not allowed here).
- Seed has no `reply_drafts`; ENQ-4411 gets its draft from Regenerate (2.3) in the demo and E2E.
- Runbook rule 5 says "not test-claude" (written for Codex). For this Claude branch the scrum master said to use
  test-claude after confirming nothing else uses it.
