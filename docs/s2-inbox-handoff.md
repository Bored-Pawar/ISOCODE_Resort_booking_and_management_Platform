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
| 2.4 Q7 GM bell | next | |
| 2.5 Sales attention request | todo | |
| 2.6 Q2 unified enquiry form | todo | |
| Gates, integration, review, screenshots | todo | |

Last done: 2.3. `staff/send.ts`: saveDraft (new rupee figure vs the quote's total/GST -> warning, logged
`draft:price-warning`), regenerate (`draftForStaff` with the model; keeps classification), approveAndSend
(enquiry then draft row locked, conditional `sent_at IS NULL` update, `first_reply_at` COALESCE, one `sent`
event), close. Confirm dialog shows channel, recipient and final text. `/dev/outbox?tab=replies` derived from
`reply_drafts`. Static unit test: only `staff/send.ts` writes `sent_at`/`approved_by`.
Next: 2.4 GM bell (StaffShell needs a bell slot; header on mobile, sidebar top on desktop).

## Gates (last run)
typecheck, lint, format ok; unit (staff, modules) 336/336. Integration `inbox.test.ts` 10/10 on test-claude
(no other run active: checked node processes; only the resort-claude `next dev`).

## Open items / blockers
- `enquiry_events` has no note column and no schema change is allowed: attention request stores the note in
  `from_value` (to_value `attention`); resolve stores `to_value = 'seen: <reply note>'` (from_value `attention`).
- No index on `enquiry_events.enquiry_id` and summary search is ILIKE on jsonb: lane/visibility use the indexed
  enquiries columns, but the attention EXISTS and search scan within them. Needs a migration later (not allowed here).
- Seed has no `reply_drafts`; ENQ-4411 gets its draft from Regenerate (2.3) in the demo and E2E.
- Runbook rule 5 says "not test-claude" (written for Codex). For this Claude branch the scrum master said to use
  test-claude after confirming nothing else uses it.
