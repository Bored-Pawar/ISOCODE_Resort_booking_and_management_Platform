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
| 2.1 Q4 inbox list | next | |
| 2.2 Q5 detail and routing | todo | |
| 2.3 Q6 draft and send | todo | |
| 2.4 Q7 GM bell | todo | |
| 2.5 Sales attention request | todo | |
| 2.6 Q2 unified enquiry form | todo | |
| Gates, integration, review, screenshots | todo | |

Last done: nav item gated by `navFor` (`enquiries.unsorted`), page by `staffPage`, retry by `requirePermission`.
Next: 2.1.

## Gates (last run)
typecheck ok, unit (auth + staff) 121/121.

## Open items / blockers
- Runbook rule 5 says "not test-claude" (written for Codex). For this Claude branch the scrum master said to use
  test-claude after confirming nothing else uses it.
