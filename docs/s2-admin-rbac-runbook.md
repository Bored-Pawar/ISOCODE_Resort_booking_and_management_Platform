# S2 runbook: staff roles (RBAC) and admin for rates, allotment, online availability and promos (A1, A2, A3, A4)

Owner: **Claude Code (Opus)**, main Claude worktree (`../resort-claude`). Start only after `claude/booking-flow` (with the M1/M2 fixes) is merged into `main`.
Scrum master approved 2026-11-08. Product decisions come from `s2-agreed-context-and-ai-routing-plan.md`; this doc turns them into build steps. Where this doc adds a rule, it wins until `01`, `02`, `07` are updated (part of this task).

## Locks for this run
Claude Code holds: `src/lib/auth/permissions.ts` (new), `src/app/(staff)/admin/(app)/{layout.tsx,page.tsx,rates/**,allotment/**,promos/**}`, `src/modules/admin/**`, admin write helpers in `src/modules/{pricing,inventory}/admin.ts` (new files), `src/components/ui/data-grid.tsx`.
Read only: `src/db/**` (no schema change), booking, payments. Codex holds `src/modules/{enquiries,ai-router}/**`, the inbox pages and `/enquire`; do not edit them. Codex consumes `permissions.ts` for the inbox (see section 2.4).

## Hard rules
1. Never push to `main`, never merge, never touch Neon production.
2. Use your own Neon test branch for `TEST_DATABASE_URL` (not the one Codex uses). Dev DB reseed is allowed through `src/db/safety.ts`.
3. Every page loader, server action and route handler checks a permission from `permissions.ts` on the server. Hiding a nav item is never the check.
4. All edits validate with Zod, store money in paise, and never break `sold + held <= allotment` or `allotment <= total_units`. No admin action bypasses a stock check.
5. If blocked on one item, log it under Open items in `docs/s2-admin-handoff.md` and continue.

## 1. Role model (from the agreed decisions)
| Capability | reservations | sales | gm |
|---|:-:|:-:|:-:|
| `rates.edit` (A1) | yes | no | yes |
| `allotment.edit` (A2) | yes | no | yes |
| `availability.toggle` (online/offline by date, A3) | yes | no | yes |
| `promos.manage` (A4) | yes | no | yes |
| `bookings.view` (A5, already built) | yes | no | yes |
| `enquiries.room` (room and other lanes) | yes | no | yes |
| `enquiries.events` (wedding, offsite) | no | yes | yes |
| `enquiries.complaints` | no | no | yes |
| `enquiries.unsorted` | no | no | yes |
| `attention.request` (sales asks reservations and GM to look at an enquiry, with a note) | no | yes | yes |
| `attention.resolve` (mark the request seen, with a reply note) | yes | no | yes |
| `notifications.gm` (bell) | no | no | yes |

Guests have none of these. Sales has no booking, inventory, rate or promo authority. GM sees everything.

## 2. Build, in this order, one commit each

### 2.1 Permissions module
`src/lib/auth/permissions.ts`: the table above as one typed constant, `can(role, cap)`, `requirePermission(cap)` (wraps `requireRole`, throws `AccessError` FORBIDDEN), and `navFor(role)`. Unit test: the full role x capability matrix as a table test, so any change to the map shows in review. Replace the A5 `requireBookingStaff` with `requirePermission('bookings.view')` (same behaviour).

### 2.2 Staff shell by role
Nav comes from `navFor(role)`. Landing `/admin` per role: reservations sees today's arrivals count, open room enquiries count and links to Rates and Allotment; sales sees open event enquiries; GM sees complaints, unsorted and both department counts. Counts are read only and may show "Coming with the inbox" until Codex's Q4 lands; no dead links. A direct URL to a page the role cannot use renders a 403 screen ("Your role doesn't include this page") with a link home, and the action returns FORBIDDEN.

### 2.3 R06 DataGrid fix (before any grid edits)
Keep the pending cell stable while an async commit runs, catch rejected and thrown commits into the cell's error state, and stop a late completion from closing another cell. Unit tests for deferred success, rejection and a thrown callback.

### 2.4 Hand off the enquiry rule to Codex (no code in their paths)
Add `enquiryVisibility(role)` to `permissions.ts`: returns the categories and lanes a role may list (reservations: room and other; sales: wedding and offsite; gm: all, plus complaints and unsorted). Unit tested. Write these lines in `06` so Codex's inbox uses them:
1. Q4 inbox filters with `enquiryVisibility(role)` and calls `requirePermission` in every action.
2. Decision, sales attention request: one button on an enquiry, "Ask reservations and GM to look", with a short note (`attention.request`). Stored as an `enquiry_events` row with action `rerouted` and the note (no schema change). Reservations and GM see a "Needs attention" list with a count badge and can mark it seen with a reply note (`attention.resolve`, also an `enquiry_events` row). Built by Codex with Q4 to Q7.

### 2.5 A1 Rates (`/admin/rates`, `rates.edit`)
1. Grid: rows are room type and plan, columns are 30 days from a start date (prev/next 30 days), weekends shaded, tabular numbers, ₹ display, sticky first column. Filter by room type.
2. Single cell edit: inline, Enter saves, Esc cancels, saved and error states per cell.
3. Bulk edit panel: room types (multi), plans (multi), date range, days of week with presets All, Weekdays, Weekends (use the seed's weekend definition), price in rupees. A preview line ("Updates 48 prices across 2 rooms") before Apply.
4. Service: `pricing/admin.ts` `setRates({ cells or range }, actor)`: Zod; price whole rupees, more than 0 and at most ₹5,00,000; dates not in the past and within the seeded inventory horizon; one transaction, one `INSERT ... ON CONFLICT (room_type_id, rate_plan_id, date) DO UPDATE` statement; `updated_by` from session. Returns the count changed.
5. Effects to state in the UI help text: existing bookings keep their price; open guest carts will see "price updated" (PRICE_CHANGED), which is already handled.

### 2.6 A2 Allotment (`/admin/allotment`, `allotment.edit`)
1. Grid: rows are room types, columns 30 days. Each cell shows allotment large and `sold · held` small, plus total units in the row header.
2. Single and bulk set (room types, range, weekdays, value).
3. Service: `inventory/admin.ts` `setAllotment(...)`: per `01` "Admin allotment change": one statement `UPDATE inventory SET allotment = $new WHERE ... AND sold + held <= $new AND $new <= total_units RETURNING`; dates that did not update are returned with the minimum allowed (`sold + held`) and the cap. Lock rows in `(room_type_id, date)` order like the hold path. Missing inventory rows inside the horizon are inserted with sold and held 0.
4. UI: rejected cells stay red with "At least 3 (already sold or held)" or "At most 8 (total rooms)". Help text: "Check availability outside the website before raising allotment."
5. Re-prove mandatory test 6 through this entry point (it was provisional until A2) and mark it final in `06`.

### 2.7 A3 Online availability by date (on the Allotment page, `availability.toggle`)
"Online" and "Offline" use `blackout_dates` (no schema change): taking a room type (or all rooms) offline for a range creates a blackout with a required reason; bringing it online deletes or trims the blackout. Before saving, show the warning list of existing bookings in that range (they stand; only new holds are blocked). Offline cells show a hatched pattern and the reason on hover or tap. Service in `inventory/admin.ts`: overlap merge, Zod, `created_by` from session.

### 2.8 A4 Promo codes (`/admin/promos`, `promos.manage`)
List (code, kind, value, validity, min nights, used / max, active), create, deactivate. Codes stored uppercase; reject case-only duplicates (review minor from B1). Percent 1 to 100, flat in whole rupees stored as paise, valid_to on or after valid_from, min nights 1 to 14, max uses 1 or more or empty. Deactivate does not affect confirmed bookings. Validity keeps today's meaning (the stay nights), stated in the help text.

## 3. Tests
Unit: permissions matrix, `enquiryVisibility`, R06 grid cases, Zod schemas (rates, allotment, blackout, promo).
PostgreSQL (own test branch):
1. Bulk rate set writes exactly the cells selected (weekday filter), one statement, updated_by set.
2. Rate edit between quote and hold gives PRICE_CHANGED (existing test 9 path via the admin service).
3. Allotment cut below sold + held is rejected for those dates only, others apply (test 6 through A2).
4. Allotment above total units is rejected.
5. Allotment edit racing 10 parallel holds on the last unit never breaks the CHECK and reconciles.
6. Offline range blocks a new hold (BLACKOUT); existing booking in range unaffected; bringing it online allows the hold again.
7. Promo uppercase and case-only duplicate rejected; deactivated promo gives PROMO_INVALID at quote.
8. Every admin action called as sales returns FORBIDDEN and writes nothing; as a guest, FORBIDDEN.

## 4. Verify
1. `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, then `pnpm test:integration` on your own test branch.
2. `pnpm dev`, real Chrome, sign in as each staff role: nav and landing match the table; sales gets the 403 screen on `/admin/rates`; reservations edits a cell, bulk sets weekends, cuts allotment below committed and sees the reason, takes Pool Villa offline for a range and a guest sees it unavailable on `/rooms`, creates and deactivates a promo and the guest field rejects it. Desktop and 375px (staff screens must not break at 375px even if dense). Screenshots `docs/screenshots/a1-*`, `a2-*`, `a3-*`, `a4-*`, `rbac-*`.
3. Independent review subagent with no context: this runbook, `01`, the diff. Blockers and majors only: permission check on every entry point, stock invariants, race with holds, input validation.

## 5. Hand off
Push `claude/admin`, open a PR into `main`, do not merge. `docs/s2-admin-handoff.md` under 80 lines. Update `06` (A1 to A4, permissions, test 6 final, the Codex inbox note) and `tdd-notes.md`.

## Out of scope here (owned elsewhere or later)
Inbox screens and escalation flow (Codex Q4 to Q7 with `permissions.ts`), GST slab editor A6, daily export A7, metrics Q8.
