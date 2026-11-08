# S2 runbook: enquiry inbox (Q4 to Q7), sales attention request, unified enquiry form (Q2 + Q9)

Owner: **Codex**, in `resort-codex`. Start only after `claude/admin` is merged into `main` (it carries `src/lib/auth/permissions.ts`, which this work uses). Branch `codex/inbox` from that `main`.
Scrum master approved 2026-11-09. Sources: `04-ai-router.md`, `05-design-system.md` (screen 7, states, copy voice), `07-backlog.md` (Q4 to Q7, Q9, H1), `06` decisions (sales attention request, inbox filtering), `s2-agreed-context-and-ai-routing-plan.md` (roles). Where this doc adds a rule, it wins until those docs are updated (part of this task).

## Locks
Codex holds: `src/modules/{enquiries,ai-router}/**`, `src/app/(staff)/admin/(app)/inbox/**`, the staff bell component, `src/app/(guest)/(site)/enquire/**`, the inbound API routes. Read only: `permissions.ts` (add nothing without asking), booking, pricing, inventory, payments, other admin pages. No schema change except the one allowed in 2.7.

## Hard rules
1. Every page loader, server action and route: Zod, then `requirePermission(...)` from `permissions.ts`, and list queries filtered by `enquiryVisibility(role)` in SQL, not in the UI.
2. Drafts are never sent automatically. Only a staff click on "Approve and send" sends, and only to the mock outbox.
3. Prices in replies come only from the server quote already filled by R4. Staff edits that add a new rupee figure show a warning ("Prices should come from the quote") but are allowed; log it as `edited`.
4. Complaints always reach the GM; nothing in the inbox can hide a complaint from the GM.
5. Own Neon test branch for `TEST_DATABASE_URL` (not `test-claude`). Never production.

## Roles (from `permissions.ts`)
| | reservations | sales | gm |
|---|:-:|:-:|:-:|
| Sees lanes | room, other | wedding, offsite | all, plus Complaints and Unsorted |
| Re-route, edit fields, edit/approve drafts | own lanes | own lanes | all |
| Ask reservations and GM to look (`attention.request`) | no | yes | yes |
| Mark attention request seen (`attention.resolve`) | yes | no | yes |
| GM bell (`notifications.gm`) | no | no | yes |

Assignment: one default owner per role (the active user of that role, lowest id). "Mine" = `owner_id` is me. Staff can reassign within the roles that may see the category.

## 2. Build, in order, one commit each, push after each

### 2.1 Q4 Inbox list (`/admin/inbox`)
Three panes on desktop per `05` screen 7: lanes and filters left, list middle, detail right. Mobile: lanes as a select, list, detail as its own page.
Lanes (only those the role may see): Mine, by category (Rooms, Weddings, Offsites, Other), Complaints (GM), Unsorted (GM), Needs attention (reservations, GM), Failed AI (GM). Count badges on Unsorted, Complaints and Needs attention.
List row: sender name, one line summary, badges for category, channel, confidence (warning colour under 0.70), complaint, AI status, grounding (from `extracted.grounding`), time waiting ("2 h 14 m").
Filters: status (new, assigned, replied, closed), channel, search in summary. Paginated (25), ordered by received_at desc within a lane; indexed queries only.
Inbox load runs the existing stuck-row sweep (bounded). States: skeleton, empty per lane ("Nothing unsorted. Good."), error with Retry.

### 2.2 Q5 Detail and routing
Raw message, channel, received time, contact (staff only), summary, extracted fields (dates, guests, budget, room, language) editable with grounding badges ("From the message", "Not in the message", "Missing"). Saving fields logs `edited` and re-runs only the quote/draft step if dates or guests changed.
One click re-route: category select and owner select, logged as `rerouted` in `enquiry_events` with from and to; lane becomes `sorted`. A re-route to a lane the actor cannot see is allowed (the item leaves their list) but owner must be a user whose role may see the new category.
Timeline: every `enquiry_events` row, newest first, with actor and note.
Failed AI: "Retry AI" button (staff, logged), resets attempts per R2.

### 2.3 Q6 Draft and send
Draft editor shows the R4 draft with the server quote block marked as "From the rate table". Buttons: Save draft, Regenerate (calls R4 again, keeps classification), Approve and send. Approve and send: confirm dialog showing recipient channel and the final text; writes `reply_drafts.approved_by`, `sent_at`, `edited`; sets `enquiries.first_reply_at` if empty and status `replied`; logs `sent`. Mock outbox: `/dev/outbox` gains a "Replies" tab listing sent replies (derived from `reply_drafts`, no new table). Nothing is sent to email or WhatsApp.
Close enquiry: logs `closed`.

### 2.4 Q7 GM bell
Bell in the staff header (GM only): unread count, list of complaint and unsorted notifications with summary and link, mark one read, mark all read. Server actions check `notifications.gm` and `user_id = me`. Polling not required; it refreshes on navigation.

### 2.5 Sales attention request (06 decision)
On an enquiry, sales and GM see "Ask reservations and GM to look" with a required note (max 500 chars). Stored as an `enquiry_events` row, action `rerouted`, `to_value='attention'`, note. "Needs attention" lane = enquiries whose latest attention row has no later resolve row. Reservations and GM see "Mark seen" with a reply note, stored as `enquiry_events` action `rerouted`, `from_value='attention'`, `to_value='seen'`. Both show in the timeline. No schema change.

### 2.6 Q2 unified enquiry form (absorbs Q9)
`/enquire` stays one form. Fields: name, email or phone, message (required), optional "What is it about?" (Stay, Wedding, Offsite or event, Something else) which only reveals extra optional fields for events: event date range, guest count, budget (₹), needs (rooms, catering, decor, conference hall as checkboxes). Keep it short: event fields collapsed until chosen. Existing prefill params keep working. Event fields go to `event_details` and are appended to `raw_text` as plain lines like today. The AI still classifies from text; the guest's choice is a hint stored in `extracted.guest_hint`, never the routing decision. DPDP consent and honeypot unchanged.

### 2.7 Channel for event form (only schema change allowed)
If the structured form needs `channel='event_form'`, it already exists in the CHECK; use it when event fields are filled, `web` otherwise. No migration.

## 3. Tests
Unit: visibility filters per role, lane predicates (needs attention latest-row logic), draft send rules (never without a staff action), price warning on edit, form Zod (event fields optional, budget positive).
PostgreSQL (own test branch):
1. Sales list never returns room or complaint rows; reservations never returns wedding rows; GM gets all.
2. Sales calling re-route, approve or attention.resolve on a room enquiry: FORBIDDEN, nothing written.
3. Approve and send twice concurrently: one `sent_at`, one `sent` event, `first_reply_at` set once.
4. Re-route logs one event and updates owner and lane atomically.
5. Attention request then resolve: lane membership correct; second request after resolve reopens it.
6. A complaint re-routed to rooms still has its GM notification.
7. Unified form with event fields creates `event_details` and one pending enquiry.
Playwright (H1 second path): staff signs in, opens ENQ-4411, edits the draft, approves and sends, sees it as replied and in the outbox.

## 4. Verify
Gates: typecheck, lint, format:check, test, build, integration on your own test branch. `pnpm dev`, real Chrome, sign in as reservations, sales and GM: lanes match the table, sales request then reservations marks seen, GM bell shows a complaint from the simulator, approve and send a draft, failed AI Retry. Desktop and 375px. Screenshots `docs/screenshots/q4-*` to `q7-*`, `q2-*`.
Independent review subagent with no context: this runbook, `04`, the diff. Blockers and majors only: permission on every entry point, visibility in SQL, never auto send, complaint always reaches GM, prices only from quote.

## 5. Hand off
Push `codex/inbox`, open a PR into `main`, do not merge. `docs/s2-inbox-handoff.md` under 80 lines. Update `06` (Q2, Q4 to Q7, Q9 folded into Q2, attention request, H1 second path) and `tdd-notes.md`.
