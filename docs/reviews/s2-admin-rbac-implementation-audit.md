# S2 admin, RBAC and inventory implementation audit

## A. Review metadata

| Field | Recorded value |
|---|---|
| Review date | 9 November 2026, IST |
| Source branch | `origin/claude/admin` |
| Reviewed commit | `fa21e36be4f35a0b26736fbd3af4738b3fe05d56` |
| `origin/main` at initial fetch | `444840d70468143629410c7407eb0fa03790d247` |
| `origin/main` at final preservation check | `9c62b7a5c4471381903b275ba9bc1f80116bd441` (independent PR #6 merge) |
| Merge base | `444840d70468143629410c7407eb0fa03790d247` |
| Detached workspace | `C:\Users\Aditya Pramod Pawar\Isocode\resort-admin-rbac-security-audit` |
| Initial audit status | Clean, detached HEAD; workspace did not previously exist |
| Final audit status | Detached at the reviewed SHA; this report is the only untracked file; no tracked modifications |
| Source branch state | Local `claude/admin` and `origin/claude/admin` both resolve to the reviewed SHA |
| Review basis | Approved S2 runbook, handoff, booking core, requirements, architecture, data model, design system, backlog and progress; complete branch diff and necessary unchanged dependencies |

The original `resort-codex` checkout initially had clean status on `codex/r1-r4-ai-routing`, HEAD `f002d106e7db3caaefeea2ffe1376888c0bf05de`. During this audit it advanced independently to `bd14a0e20bbdd48fdec615a098bb8b0c2144498e`, still clean on the same branch. Its reflog records `docs(ai-router): record authorized PR publication` at 01:39:34 IST. No audit command committed, pushed, switched, reset, stashed, cleaned or edited that checkout. This concurrent movement is recorded rather than claiming the original HEAD stayed constant. The audit checkout and admin source ref stayed fixed. The shared `origin/main` reference independently advanced to `9c62b7a5c4471381903b275ba9bc1f80116bd441` (Merge PR #6: reviewed R1-R4 AI routing and remediation) by the final check. Its merge base with the audited admin commit remains `444840d70468143629410c7407eb0fa03790d247`, and the three-dot source diff is unchanged. This audit did not perform that merge or fetch the later reference. Compatibility with the new main tree was not tested by merging.

Commands executed, grouped by purpose:

```text
git status --short --branch
git branch --show-current
git rev-parse HEAD
git worktree list --porcelain
git fetch origin
git rev-parse origin/claude/admin
git merge-base origin/main origin/claude/admin
git rev-parse origin/main
git worktree add --detach ../resort-admin-rbac-security-audit origin/claude/admin
pnpm install --frozen-lockfile
Get-Content -LiteralPath <assignment/specification/source/test path> -Encoding utf8
rg / rg --files <targeted paths and patterns>
git diff origin/main...HEAD
git diff --stat origin/main...HEAD
git diff --name-status origin/main...HEAD
git diff --numstat origin/main...HEAD
git diff origin/main...HEAD -- <reviewed path groups>
git diff --name-only origin/main...HEAD -- <protected/unrelated paths>
pnpm test
pnpm typecheck
<PowerShell here-string> | node  [in-memory RatesBoard replay]
<PowerShell here-string> | node  [in-memory SQL-call trace]
git rev-parse refs/heads/claude/admin
git log --oneline f002d106e7db3caaefeea2ffe1376888c0bf05de..HEAD -n 8
git reflog show --date=iso --format='%h %gd %gs' -n 5 refs/heads/codex/r1-r4-ai-routing
git diff --quiet
git diff --cached --quiet
Test-Path -LiteralPath .env.local
```

Implementation inspection and dependency installation/validation occurred in the detached workspace. The original checkout received only initial status/reference/fetch/worktree setup commands and later read-only preservation checks. The full diff has 6,063 lines across 73 files, including binary screenshot additions. Text changes were inspected; screenshots were not treated as proof of authorization or database correctness. No environment file was copied or displayed. `.env.local` is absent in the audit checkout. Report creation used UTF-8 file writes; an initial oversized Windows command failed before process creation and was split into smaller writes. No implementation file was written.

## B. Executive summary

**Verdict: FIX MAJORS. Blockers: 0. Majors: 3.**

The server permission matrix matches the runbook exactly. All seven new admin actions authorize before calling a service; their actors come from the verified session. Allotment changes and guest holds share deterministic inventory row locks and conditional stock checks. Rate and allotment SQL is already batched.

Three material defects remain: the rates grid can permanently conceal a later successful bulk price change behind a stale single-cell override (M01); blackout serialization has a gap when A2 concurrently creates previously missing inventory rows (M02); and blackout warnings can report no bookings after silently dropping an affected confirmed booking (M03).

No serious authorization bypass, stock CHECK violation, mutation of saved booking prices, payment-rule change, or AI-routing scope contamination was established. PostgreSQL concurrency was assessed statically; it was not tested against a database in this audit.

## C. Authorization and role matrix

The following approved and actual values match at `src/lib/auth/permissions.ts:12`. Y/N entries apply to both the runbook and implementation.

| Capability | guest | reservations | sales | gm |
|---|:---:|:---:|:---:|:---:|
| `rates.edit` | N | Y | N | Y |
| `allotment.edit` | N | Y | N | Y |
| `availability.toggle` | N | Y | N | Y |
| `promos.manage` | N | Y | N | Y |
| `bookings.view` | N | Y | N | Y |
| `enquiries.room` | N | Y | N | Y |
| `enquiries.events` | N | N | Y | Y |
| `enquiries.complaints` | N | N | N | Y |
| `enquiries.unsorted` | N | N | N | Y |
| `attention.request` | N | N | Y | Y |
| `attention.resolve` | N | Y | N | Y |
| `notifications.gm` | N | N | N | Y |

`requirePermission` delegates to `requireRole` (`permissions.ts:55`; `guards.ts:26`). Auth.js reads identity/role from its JWT callback, originally populated by database-verified credentials (`config.ts:25`, `credentials.ts:24`). Admin actions do not accept an actor parameter. `actionActor` constructs `{ userId: user.id, role: user.role }` from the session (`_lib/access.ts:31`); schemas strip unrelated payload fields. A submitted role, owner or editor cannot replace that actor. SQL values are parameterized.

| Entry point | Server boundary before privileged access | Assessment |
|---|---|---|
| `/admin/rates` | `rates/page.tsx:17`, `staffPage('rates.edit')` | Sales renders Forbidden before rates/catalog reads |
| `/admin/allotment` | `allotment/page.tsx:17`, `staffPage('allotment.edit')` | Sales renders Forbidden before stock reads |
| `/admin/promos` | `promos/page.tsx:13`, `staffPage('promos.manage')` | Sales renders Forbidden before promo reads |
| `/admin/bookings`, `/admin/bookings/[ref]` | `PageGate('bookings.view')` at `bookings/page.tsx:259`, `bookings/[ref]/page.tsx:145`; independent loader guard at `bookings/_lib/access.ts:12` | Sales renders Forbidden; list, detail and refund loaders independently guard reads |
| `setRatesAction` | `rates/actions.ts:8` | Correct permission, then Zod, then service |
| `setAllotmentAction` | `allotment/actions.ts:17` | Correct permission, then Zod, then service/expiry |
| `bookingsInRangeAction` | `allotment/actions.ts:32` | Correct availability permission before booking read |
| `setOfflineAction`, `setOnlineAction` | `allotment/actions.ts:51`, `:66` | Correct availability permission before writes |
| `createPromoAction`, `deactivatePromoAction` | `promos/actions.ts:15`, `:30` | Correct promo permission before writes |
| `/admin` overview | `_lib/access.ts:45` staff guard; `overviewFor` capability filtering; role-checked booking service | Sales gets event placeholders, reservations gets room/arrivals items, GM gets both departments and GM items |

Paths in the table are relative to `src/app/(staff)/admin/(app)/` unless specified otherwise. Each underlying admin service also checks `can(actor.role, capability)` before obtaining a DB client or performing expiry. A browser cannot directly invoke these ordinary service functions as server actions: exposed action files take unknown business input and create the actor themselves.

Unit tests invoke all seven actions as sales, guest and signed out and assert exact `{ ok: false, code: 'FORBIDDEN' }` with no admin service call (`_lib/actions.test.ts:92`). Authorized roles reach the service. Together with inspection of early returns, this establishes no write path following these authorization failures without making a live database assertion.

All four requested sales 403 screens and the nested booking detail were verified in source, not through a live browser. The screen uses the required message and home link (`_components/forbidden.tsx:10`). As disclosed by the handoff, streaming produces a Forbidden screen rather than an HTTP 403 status; no protected data read relies on that status. Guests are also rejected by the staff shell and action/service guards.

No admin API route was added. Existing API routes are unchanged; payment/cron/inbound endpoints retain their documented machine authentication exemptions. Existing guest hold/pay actions retain guest-session and booking-owner checks. `attention.request`, `attention.resolve`, enquiry visibility and the GM permission are correctly defined and unit tested; actual inbox/escalation actions are explicitly a later Codex Q4–Q7 task, not missing A1–A4 implementation.

**Authorization finding count: 0 blockers, 0 majors.**

## D. Blocker findings

None established within the audited scope.

## E. Major findings

### M01 — MAJOR — Saved rate overrides conceal subsequent persisted bulk changes

**Location/function:** `src/app/(staff)/admin/(app)/rates/rates-board.tsx:77`, `RatesBoard`; related state/commit code at lines 55 and 111, bulk completion at line 173.

**Expected:** After a successful bulk edit and route refresh, the grid and the value opened for inline editing reflect the saved rate for every affected cell.

**Actual:** `overrides[cell] ?? r.prices[date]` always prefers the last successful inline price. The override is never retired when refreshed rows arrive or when a bulk edit succeeds. It remains active whenever the same grid start date is displayed.

**Concrete failure:** Save one EP/night cell at ₹12,500, then bulk-set a range containing it to ₹20,000. The service persists ₹20,000 and the toast reports success. The refreshed grid still displays ₹12,500 and seeds the next inline editor with ₹12,500. Staff can unknowingly overwrite the new price by saving that stale value. Ordinary refreshes in the app do not repair the display.

**Root cause:** A persistent local saved-price map is used as if it were a temporary optimistic overlay. The bulk success callback only calls `router.refresh()`. Installed Next documentation confirms refresh preserves unaffected client `useState` (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`, useRouter API).

**Existing mitigation:** The SQL price and guest quote remain authoritative; a full component remount/page reload removes the map. This does not correct the normal editing workflow.

**Minimal correction:** Reconcile or retire successful per-cell overlays when authoritative refreshed rows arrive, and invalidate overlapping overlays after bulk saves. Preserve a generation/version so an older response cannot restore an obsolete overlay. Add a regression for inline save → overlapping bulk save → refreshed rows.

**Evidence:** Code inspection plus an in-memory replay of the actual transpiled `RatesBoard` with mocked hooks/router/actions and supplied refreshed rows. No DOM/server/database was involved. Output: `afterInlineDisplayedRupees=12500`, `afterBulkPersistedRupees=20000` (simulated authoritative row), `afterBulkRefreshDisplayedRupees=12500`, `refreshCalls=2`, `dbCalls=0`. This demonstrates rendering/state behavior, not a live database write.

### M02 — MAJOR — Missing stock rows escape the blackout/hold lock boundary

**Location/function:** `src/modules/inventory/admin.ts:297`, `lockRange`, called by `setOffline` at line 339; stock-row creation at line 112. The unchanged consumer is `src/modules/inventory/internal.ts:74`, `lockNights`, with its separate blackout read at line 79.

**Expected:** Per booking-core Blackouts and the comment at `inventory/admin.ts:317`, a hold already past its blackout check commits before the offline change completes. A2's supported creation of missing inventory rows must participate in the same serialization.

**Actual:** Offline locks only inventory rows that exist in its SELECT snapshot. It does not create a lockable row for an absent room/date. The blackout-edit advisory lock is taken only by online/offline edits, not by A2 or guest acquisition. A new inventory row can therefore become sellable after the offline lock step while the blackout transaction is still uncommitted.

**Concrete static interleaving:** A room/date has a valid rate but no inventory row, an explicitly supported A2 state. (1) Offline takes its advisory lock and `lockRange` finds no row. (2) A2 creates that date with allotment 1 and commits. (3) A new guest hold locks the newly created row and reads no committed blackout. (4) Offline inserts its blackout, commits and returns success without waiting for the guest's row lock. (5) The guest increments held and inserts/commits a new HELD booking after the offline operation has completed. The documented commits-before-offline ordering is broken.

**Root cause:** Existing-row locks do not protect an absent room/date against later insertion. The otherwise correct shared inventory-lock mechanism lacks a stable lock target for this supported creation path.

**Existing mitigation:** Existing inventory rows serialize correctly; stock bounds and the database CHECK are preserved. A hold whose blackout read starts after the blackout commits is rejected. The defect concerns overlapping offline/A2/hold operations when stock was absent at the offline lock step; it is not a general bypass of a committed blackout.

**Minimal correction:** Before publishing an offline range, create missing inventory rows with zero allotment/sold/held in deterministic `(room_type_id, date)` order, then lock the complete target set before writing the blackout. Coordinate this with A2's ordered insertion; alternatively use a stable shared lock protocol that all three paths follow. Prove the interleaving on an isolated PostgreSQL branch before release.

**Evidence:** Code inspection and static race analysis only. No PostgreSQL race test was run. Existing `admin-availability` tests seed every target inventory row and do not cover concurrent A2 insertion into an absent target date.

### M03 — MAJOR — Blackout warnings can falsely report no existing bookings

**Location/function:** `src/modules/inventory/admin.ts:257`, `bookingsInRange`; post-query scope filtering at line 266; false-empty presentation at `src/app/(staff)/admin/(app)/allotment/availability-panel.tsx:182`.

**Expected:** Before staff take a room type/date range offline, the warning lists existing overlapping bookings, without silently presenting an incomplete search as empty.

**Actual:** Each status query first limits the newest bookings across all room types to 200 and bounds check-in to a guessed 60-day lookback. Only afterwards does the admin helper filter actual date overlap and selected room type. It returns an ordinary complete-looking array, with no truncated flag. The public staff list really applies `ORDER BY created_at DESC LIMIT input.limit` (`src/modules/booking/staff.ts:103`).

**Concrete failure:** There are 201 confirmed bookings with check-ins in the requested 30-day range, spread across nights within physical capacity. The oldest affected booking is for Pool Villa; the newer 200 are other room types. Checking Pool Villa first returns those other 200 and then filters all of them out. The panel says “No bookings on these dates” and enables Take offline, even though a confirmed Pool Villa booking stands in the selected dates. A stay beginning more than 60 days before the range is another omission; the quote contract supplies no corresponding maximum-stay guarantee.

**Root cause:** Pagination/limiting and an assumed stay duration are applied before the required overlap and room predicates, with no completeness signaling.

**Existing mitigation:** The handoff acknowledges the 60-day/200 limit, and taking a room offline does not cancel or mutate existing bookings. The UI still gives staff a materially false occupancy warning before an operational closure.

**Minimal correction:** Obtain complete overlap-and-room-filtered results through an approved booking-module entry point, applying those predicates before a limit and paging until complete. If completeness cannot yet be provided, surface the limitation and prevent an incomplete result from claiming “No bookings.” A public read contract addition must follow the repository approval rule.

**Evidence:** Code inspection of the admin helper, unchanged booking-list SQL and the warning panel. The omission follows directly from filtering a capped, differently scoped result; no database fixture was created.

## F. Allotment and race analysis

`setAllotment` authorizes and Zod-validates before expiry or stock writes (`inventory/admin.ts:77`). `windowError` rejects past dates and dates beyond today IST +179. Expiry runs in a separate booking-owned transaction before the admin stock transaction begins.

The stock transaction inserts missing targets at zero counts in ordered SQL (`:112`), locks targets in one `ORDER BY i.room_type_id, i.date FOR UPDATE OF i` statement (`:157`), performs one conditional UPDATE (`:119`) requiring `sold + held <= requested <= total_units`, and queries rejections under retained row locks (`:126`). Rejected cells include requested value, current minimum and room cap. SQL failure rolls back the stock transaction; earlier committed lazy expiry is intentionally separate.

| Required interleaving | Static assessment |
|---|---|
| Guest takes final room while staff cuts allotment | Both queue on the same inventory locks. Guest first: held increases and cut is rejected if below committed. Staff first: guest sees the reduced stock and returns SOLD_OUT. No CHECK violation established. |
| Two staff edits target the same room/date | Ordered target locks serialize them; the later conditional update uses current committed stock. Last valid write wins. |
| Bulk edit races a multi-room hold | Both lock their inventory sets across room types in the same SQL order. No per-type application loop or reversed common lock sequence found. The hold still rejects its entire cart on a stock failure. |
| Hold expires during the edit | Expiry locks booking rows then ordered stock; A2 locks no booking row after taking stock. If expiry releases first the cut can use the lower commitment; otherwise a conservative rejection is possible and expiry later releases the count. No double release or stock inconsistency established. |
| Bulk contains valid and invalid stock cuts | Valid cells apply in the single stock transaction; invalid cells retain allotment and report min/cap. This is expressly the approved per-date behavior, not a transaction rollback bug. |

**Specification discrepancy:** Assignment section 4 invariant 5 requests rejection “without partial application.” Approved runbook section 3 test 3 instead requires rejected dates only, with other dates applying; backlog A2 also says “rejected per date,” and the implementation test explicitly expects that result (`tests/integration/admin-allotment.test.ts:54`). This audit follows the approved specifications, as instructed, and does not manufacture an all-or-nothing finding. Malformed/Zod-invalid requests do not enter the stock transaction. A future policy change would need scrum-master approval.

The five requested allotment interleavings show no additional blocker or major in the existing-row path. M02 separately concerns blackout serialization with the missing-row insertion feature. These are static conclusions; passing unit tests do not establish real database concurrency correctness.

## G. Rates, blackouts and promotions

**Rates.** `pricing/admin.ts:50` validates whole rupees 1–500,000, validates real date strings, checks the IST editing window and uses one transaction containing one `INSERT ... ON CONFLICT ... DO UPDATE`. Cells join their own active rate plan/room pair; ranges select named rooms/plans and `extract(dow)` values. Friday/Saturday matches the seed's weekend definition. Other dates/plans/rooms are not selected. `updated_by` uses the action's session actor. No SQL touches bookings or saved nights. Guest hold reprices using `quoteInTx` and compares the hash (`booking/hold.ts:97`), yielding PRICE_CHANGED on an intervening committed rate edit. M01 is a material grid/persistence mismatch despite correct SQL.

`adminWindow` uses today IST through today +179 inclusive, as explicitly documented in the branch's booking core/backlog. The implementation does not discover an absolute seed-run end date from the database; this is a moving 180-day policy. It rejects today −1 and today +180, including around IST midnight, and can fill missing rate cells. No added horizon policy was inferred beyond those documented boundaries.

**Blackouts.** Admin ranges are inclusive `[from,to]`; guest stays are `[checkIn,checkOut)`. The consumer predicate `start_date < checkOut AND end_date >= checkIn` correctly permits checkout on the blackout's first date and blocks a stay-night on its last date. Same-scope adjacent/overlapping offline ranges merge; online removes whole ranges, trims left/right edges using ±1 day, or splits a middle removal. The global transaction advisory lock added in `72ee70c` serializes these edits before range/blackout-row locks and fixes the previously reported lost-online-part race. Readers see the delete/insert changes atomically at commit.

A room-specific online request under an all-room blackout returns ALL_ROOMS_OFFLINE without changing coverage. All-room and room-specific scopes are distinct; bringing all-room coverage online does not erase independently scoped maintenance blackouts, consistent with the documented same-scope model. Online/offline actions do not change sold/held/allotment or booking snapshots. Guest availability and hold acquisition both read blackout coverage; removing the last covering blackout makes stock eligible again, subject to normal allotment. Existing-row hold locking is correct; M02 identifies the missing-row exception and M03 the incomplete warning.

**Promotions.** Server Zod normalization trims/uppercases codes. Creation takes an advisory lock keyed by the normalized code, checks `upper(code)` including legacy rows, and inserts under the unique code constraint (`pricing/admin.ts:195`). Concurrent case variants through this path cannot both create a code. Percent/flat bounds, real ordered validity dates, minimum nights and optional max uses are enforced; flat rupees become integer paise in pricing-owned code. The approved scope is list/create/deactivate; modification/reactivation is not promised and no extra requirement was invented.

Deactivation updates only `promo_codes.active`. The quote SQL selects authoritative promo data by case-insensitive code, and `pricing/read.ts:85` rejects missing/inactive/out-of-stay-window/insufficient-night/exhausted promos with PROMO_INVALID. Browser-supplied discounts or promo objects are not pricing inputs. Validity means stay nights, not booking date; already saved booking totals/nights remain unchanged. Approved promo-use overshoot and the pre-existing zero-total payment limitation are not reclassified as new admin-branch defects.

**Promotions finding count: 0 blockers, 0 majors.**

## H. DataGrid assessment

The R06 state machine fixes the original asynchronous editor defect. Pending is set synchronously before awaiting the callback; start/type/blur/Escape cannot discard the pending cell. Returned error strings and rejected/thrown callbacks keep the cell and draft, with pending cleared (`data-grid-editor.ts:90`). A session generation invalidates late completions after a reset, so they cannot close or attach an error/saved mark to another edit. Repeated Enter during a commit does not duplicate it. Successful completion records the exact submitted cell.

The React wrapper disables other edit buttons while pending, makes the pending input read-only, and renders persistent error text with `role='alert'`, row/date context and `aria-invalid` (`data-grid.tsx:171`, `:232`). Error blur does not dismiss it; Escape, opening a new editor or an intentional date reset does. The eight pure editor tests cover deferred success, returned error, deferred rejection, synchronous throw, late success/failure after reset, callback freshness and non-error blur. All passed in the full unit run.

No separate blocker or major was established in R06's editor lifecycle. M01 is the integrating RatesBoard's stale value map; the editor's generation guard does not retire that parent state. DOM, assistive-technology and live browser behavior were not exercised in this read-only audit.

## I. Database round-trip analysis

Counts cover a valid service call updating 30 days ×4 known room types, all weekdays, one selected rate plan (120 rate cells). Selecting three plans raises row count to 360 without changing statement counts. They exclude page refresh reads, authentication/login, pool connection setup and lock-wait duration. Sequential DB depth counts awaited SQL commands; it is not a measurement of elapsed network time.

| Operation | Sequential DB depth | SQL statement count | Per-cell loop? | Major concern? |
|---|---:|---:|---|---|
| 30×4 rate update | 1 data; **3 including BEGIN/COMMIT** | 1 data +2 control = **3** | No | No batching defect; M01 is display state |
| 30×4 allotment update, no expired holds | 5 data; **9 including control** | 5 data +4 control = **9** | No | No per-cell query defect |
| 30×4 allotment update, expiry releases holds | 10 data; **14 including control** | 10 data +4 control = **14** | No | No per-cell query defect; pre-existing unbounded expiry batch remains documented |

**Rate sequence:** BEGIN → one bulk upsert → COMMIT. One transaction, two transaction-control commands, no data SELECT preceding the update. An unchanged-price request still executes that upsert, returning zero changed rows.

**Allotment sequence:** Two consecutive top-level transactions (four transaction-control commands), not a transaction per cell:

1. Booking-owned lazy expiry: BEGIN → one conditional bookings expiry UPDATE. If it returns no bookings, COMMIT immediately: one data statement.
2. If expiry returned bookings: one grouped room-line SELECT; one ordered inventory SELECT; `adjustNights` performs a second ordered inventory SELECT and one aggregated UPDATE; one batched booking-events INSERT; COMMIT. Together with the expiry UPDATE, six data statements in this transaction. Both inventory lock statements are present in the actual helper chain.
3. Admin transaction: BEGIN → one INSERT-missing statement → one ordered target SELECT FOR UPDATE → one conditional bulk UPDATE → one rejected-target SELECT → COMMIT. Four data statements, regardless of 120 target cells or number of rejections.

Sources: `pricing/admin.ts:86`; `inventory/admin.ts:89`, `:111`; `booking/internal.ts:34`, `:99`, `:112`, `:126`; `inventory/internal.ts:153`. Installed Drizzle's transaction wrapper uses postgres-js `begin`; postgres-js explicitly awaits BEGIN before the callback and COMMIT after it (`node_modules/drizzle-orm/postgres-js/session.js:117`, `node_modules/postgres/src/index.js:216`). No extra transaction configuration is supplied here.

A no-network, in-memory trace of these actual service/helper sources reproduced data/control counts `1/2`, `5/4`, `10/4`. SQL execution was mocked; BEGIN/COMMIT markers followed the verified driver protocol. Its first expired-branch replay hit the real missing-adjusted-row guard because the mock returned zero rows; the corrected 30-row response allowed the trace to complete. That harness setup failure was not a repository test failure.

All SQL is sequential on each transaction connection. JavaScript maps/loops build VALUES/arrays and events but do not submit per-cell/per-date queries. The successful expired-hold path stays constant in statement count as bookings increase, though SQL work/parameter count and locking time increase. Unauthorized/schema/window-invalid writes have depth zero. A connection/SQL failure rolls back at its failure point; no successful-write count is claimed for that branch. No Promise.all batching or latency reduction is claimed for a shared transaction connection, and no change that would break lock ordering is recommended.

## J. Scope contamination

The complete branch diff contains no modifications to `src/modules/enquiries/**`, `src/modules/ai-router/**`, `src/modules/booking/**`, `src/modules/payments/**`, `src/app/(guest)/**`, `src/app/api/**` or `src/db/**`. Guest hold acquisition, confirmation, payment handling and guest booking authorization source are unchanged.

Necessary integrations are the booking-owned scoped lazy-expiry helper and public `booking.listForStaff` warning read from the new inventory admin helper; shared role/session helpers; catalog reads; and A5 page wrappers using the new permission helper. These do not replace booking/payment business rules. Lazy expiry is a deliberate existing write integration rather than a read-only booking query. The new admin barrel exports admin services/types; existing frozen booking/pricing/inventory public contracts are unchanged. DataGrid's added UI props/types are part of the authorized R06/admin-grid scope.

Documentation updates record admin behavior, lock ownership, backlog/test evidence and the future Codex inbox handoff. No unrelated AI implementation or payment behavior expansion was found.

**Scope finding count: 0 blockers, 0 majors.**

## K. Validation results

| Validation | Exact result |
|---|---|
| `pnpm install --frozen-lockfile` | Passed; pnpm 12.18.0; lockfile resolution unchanged, 415 packages installed from the local store |
| `pnpm test` → `vitest run --project unit` | **48 test files passed; 420 tests passed; 0 failed; 0 skipped**, exit 0; reported duration 5.68 seconds |
| `pnpm typecheck` → `next typegen && tsc --noEmit` | **Passed**, exit 0; Next route generation succeeded |
| Supplemental source replays | Rate stale-state scenario reproduced; SQL branch counts matched 3/9/14 including transaction commands; all in memory, no DB connection |
| PostgreSQL integration tests | **Intentionally not run**, including existing `tests/integration/admin-*.test.ts` and core race tests |
| Browser/E2E/build/lint/format | Not run in this audit; not substituted for the two requested validation commands |

The Vitest unit project includes only `src/**/*.test.ts` and `tests/unit/**/*.test.ts`; the separate integration project includes `tests/integration/**/*.test.ts`. Unit mocks and supplemental replays did not invoke live database/provider integrations. No migrations, seeds, resets, live payment tests, email/notification sends, dev server or shared integration database were used. Installation and Windows validation subprocesses ran with approved filesystem/subprocess access in the requested sibling workspace.

The handoff's earlier 420-unit/118-of-119 integration claims were read as historical author evidence, not independently rerun database results. In particular, its blackout/promo preservation examples hold bookings in HELD state; this audit's conclusions about confirmed snapshots also rely on inspecting writes and unchanged saved-total paths, not on claiming those examples prove confirmed-state behavior. Unit success does not establish PostgreSQL isolation, race, deadlock or reconciliation correctness. Live sales-page rendering and accessibility remain verification gaps.

## L. Final recommendation

**FIX MAJORS.** Correct M01–M03 before release. Re-run unit/typecheck gates after correction, verify the inline→bulk→refresh workflow in a browser, and prove the missing-row blackout/A2/hold interleaving plus complete booking warnings on an explicitly isolated PostgreSQL test branch. No blocker was established, but the current UI can misrepresent authoritative rates and occupancy warnings, and a supported missing-stock creation path defeats documented blackout serialization.

This report is deliberately untracked. No fixes, implementation edits, commit, push, merge, rebase or cherry-pick were performed by this audit. The original worktree was not edited by the audit; its independent R1–R4 advancement is disclosed in A. Claude's admin branch and detached implementation source remain at the reviewed commit.
