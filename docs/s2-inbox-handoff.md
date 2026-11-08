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
| 2.6 Q2 unified enquiry form | next | |
| Gates, integration, review, screenshots | todo | |

Last done: 2.5. `staff/attention.ts`: request (`attention.request`, own lanes, never a complaint, not
while open) and resolve (`attention.resolve`, while open). Reservations can open (read only) a non-complaint
enquiry once sales asked; working it still needs own lanes. Panel on the detail; notes in the timeline.
Next: 2.6 unified `/enquire` form (Codex lock lifted to this branch by the runbook).

## Gates (last run)
typecheck, lint, format ok; unit (staff, modules) 336/336. Integration `inbox.test.ts` 13/13 on test-claude
(no other run active: checked node processes; only the resort-claude `next dev`).

## Open items / blockers
- `/admin` overview still shows enquiry counts as "Coming with the inbox" (`_lib/overview.ts`, an admin page,
  read only per the runbook locks). `inbox.counts` can feed it; needs scrum master OK.
- `enquiry_events` has no note column and no schema change is allowed: attention request stores the note in
  `from_value` (to_value `attention`); resolve stores `to_value = 'seen: <reply note>'` (from_value `attention`).
- No index on `enquiry_events.enquiry_id` and summary search is ILIKE on jsonb: lane/visibility use the indexed
  enquiries columns, but the attention EXISTS and search scan within them. Needs a migration later (not allowed here).
- Seed has no `reply_drafts`; ENQ-4411 gets its draft from Regenerate (2.3) in the demo and E2E.
- Runbook rule 5 says "not test-claude" (written for Codex). For this Claude branch the scrum master said to use
  test-claude after confirming nothing else uses it.
