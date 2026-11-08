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
| 2.2 Q5 detail and routing | next | |
| 2.3 Q6 draft and send | todo | |
| 2.4 Q7 GM bell | todo | |
| 2.5 Sales attention request | todo | |
| 2.6 Q2 unified enquiry form | todo | |
| Gates, integration, review, screenshots | todo | |

Last done: 2.1. `src/modules/enquiries/staff/{rules,queries,service}.ts` (lanes, visibility and lane SQL,
list with keyset pages of 25, count badges, bounded R2 sweep on load); `/admin/inbox` three panes (lg), lane
select below lg. Nav entry is now "Inbox" for any `enquiries.*` holder; Unsorted is a GM-only lane.
Next: 2.2 (`/admin/inbox/[id]` detail; list rows already link there; Retry AI moves into the detail).

## Gates (last run)
typecheck, lint, format:check ok; unit (enquiries, auth, staff) 165/165. Integration not yet run.

## Open items / blockers
- `enquiry_events` has no note column and no schema change is allowed: attention request stores the note in
  `from_value` (to_value `attention`); resolve stores `to_value = 'seen: <reply note>'` (from_value `attention`).
- No index on `enquiry_events.enquiry_id` and summary search is ILIKE on jsonb: lane/visibility use the indexed
  enquiries columns, but the attention EXISTS and search scan within them. Needs a migration later (not allowed here).
- Between 2.1 and 2.2 the list links to the detail route that 2.2 adds.
- Runbook rule 5 says "not test-claude" (written for Codex). For this Claude branch the scrum master said to use
  test-claude after confirming nothing else uses it.
