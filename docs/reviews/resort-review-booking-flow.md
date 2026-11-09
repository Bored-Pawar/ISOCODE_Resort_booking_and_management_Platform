# Independent S2 Booking Flow Code Review

## Review metadata

- Review date: 8 November 2026 (IST).
- Invocation repository: `C:/Users/Aditya Pramod Pawar/Isocode/resort-codex`.
- Shared primary repository worktree: `C:/Users/Aditya Pramod Pawar/Isocode/Resort_booking_web_app`.
- Source branch: `claude/booking-flow`.
- Source HEAD when selected, and reviewed commit: `8e1d4f66cd76a85d2f08c229fcde3c2ef7fa395a`.
- Review worktree: `C:/Users/Aditya Pramod Pawar/Isocode/resort-review2`.
- Detached review HEAD: `8e1d4f66cd76a85d2f08c229fcde3c2ef7fa395a`.
- Comparison: `origin/main...HEAD`; local `origin/main` and merge base both `e1e3d92d80ccfa6b2e89dd4fd23166bde11ba944`. No fetch, pull, merge or source-branch checkout was performed.
- Status: clean on creation and after dependency installation/checks. The only review-authored repository file is this untracked report; tracked and staged implementation diffs are empty.
- During review, the source branch advanced externally to `0dc08d11211e72f5665008f1b806bfe5a7bb15dc`. Its intervening commit changes only `docs/s2-booking-handoff.md`. This report remains pinned to the original detached SHA.
- No `.env.local` existed in the new detached worktree. No configuration was copied, changed or printed, and no database connection was opened.

### Commands and checks executed

Git inspection included `git status --short`, `git rev-parse`, `git worktree list --porcelain`, `git merge-base origin/main HEAD`, `git diff origin/main...HEAD` (reviewed in file batches, with a complete hunk inventory), `git diff --stat`, `git diff --numstat`, `git diff --check origin/main...HEAD`, and final unstaged/staged `git diff --exit-code` checks. File navigation used `rg`, `rg --files` and `Get-Content -LiteralPath`.

```text
git worktree add --detach ../resort-review2 8e1d4f66cd76a85d2f08c229fcde3c2ef7fa395a
pnpm install --frozen-lockfile
pnpm test --no-cache
pnpm test --no-cache 'src/app/(guest)/(site)/book/pay/actions.test.ts'
```

- Frozen installation passed: 415 packages, pnpm 12.18.0; no dependency versions or lockfile changed.
- Full unit run: **286 passed, 1 failed**, across 42 files. Failure: `src/app/(guest)/(site)/book/pay/actions.test.ts:60`, expecting `ended` but receiving `gated`. The test captures `now`, then constructs expiry using a later real `Date.now()` call; its minus-one-millisecond assumption can fail as time advances.
- Targeted repeat: **12/12 passed** in that file. The original full-suite failure is retained; a fully passing complete run is not claimed.
- A Node/TypeScript harness transpiled existing action code in memory, with authentication, booking reads, acquisition and profile writes mocked. Two simultaneous `holdStay` calls produced `listCalls=2`, `acquireCalls=2`, and redirects to two different references. It created no files and used no database or network.
- `git diff --check origin/main...HEAD` passed.
- Installed Next.js server-action/data-security guides and the actual Drizzle/postgres client implementations were inspected.

### Checks intentionally not run

**`test:integration` was not executed.** No E2E/browser booking flow, database reset, seed, migration, database mutation test, real payment, email delivery or live webhook was executed. PostgreSQL races and deployment configuration were not tested at runtime. Type generation, typecheck, build and lint were not run as part of this read-only investigation. Unit tests used mocked booking/payment dependencies.

## Executive summary

**Overall verdict: MAJOR ISSUES**

- **Blockers: 0**
- **Major issues: 2**

The double-hold guard is a check outside the acquisition transaction, so concurrent submissions or refreshes can create multiple holds for one intended stay. The new hold/refresh paths also hydrate up to 50 complete historical bookings through a sequential query loop before taking inventory.

No exploitable guest ownership bypass, reachable sales access to A5, amount substitution, duplicate-payment state transition or inventory over-allotment race was established in the reviewed paths. These are bounded review conclusions, supported primarily by static inspection, rather than a complete security certification.

## Findings

### M1 — MAJOR: Concurrent submissions bypass the double-hold guard

**Primary reference:** `src/app/(guest)/(site)/book/actions.ts:62`  
**Affected functions:** `holdStay`, `refreshHold`, and their calls to `booking.acquireHold`.  
**Related references:** `src/app/(guest)/(site)/book/actions.ts:72`; `src/app/(guest)/(site)/book/pay/actions.ts:109`; `src/app/(guest)/(site)/book/pay/actions.ts:118`; `src/modules/booking/hold.ts:43`; `src/modules/booking/hold.ts:74`.

**Concrete failure sequence:**

1. A guest submits the same cart from two tabs, with enough inventory for two copies of that cart.
2. Both requests finish `listForGuest` before either acquires a hold. Both snapshots contain no matching live hold.
3. Request A acquires inventory locks, increments held stock, inserts booking A and commits.
4. Request B acquires those inventory locks afterward. Remaining inventory is sufficient, so it increments held stock again, inserts booking B and commits.
5. The guest receives two payment references and twice the intended inventory is held. With only one cart's worth of stock, the second request instead reports sold out despite the first request having acquired the guest's hold.

Two concurrent refresh requests have the same gap after cancellation: the second cancellation may return `NOT_HELD/CANCELLED`, both fresh-hold lookups can finish before acquisition, and both can reserve replacements.

**Why protections fail:** The reuse query runs in a separate transaction and there is no request/cart serialization or uniqueness check in the acquisition transaction. Ordered inventory locks enforce allotment but do not identify a repeated intent. Unique booking references distinguish the two orders. Next.js client dispatch does not serialize requests from different tabs or direct concurrent requests.

**Expected behaviour:** Concurrent submissions for the same guest and intended stay reuse one live hold. A refresh replay returns the already-created replacement.

**Minimal suggested fix:** Serialize reuse and acquisition inside the booking-owned transaction, for example with a transaction-scoped lock on the authenticated guest and stay identity, followed by a scoped live-hold query before inventory acquisition. Apply the same invariant to both submit and refresh; preserve existing booking/inventory lock ordering.

**Verification:** Static transaction analysis, plus the database-free action harness described above. The harness confirms both requests reach acquisition and receive distinct mocked references; the PostgreSQL interleaving was not executed.

### M2 — MAJOR: Holding or refreshing loads up to 50 full bookings sequentially

**Primary reference:** `src/app/(guest)/(site)/book/actions.ts:62`  
**Affected functions:** `holdStay` and `refreshHold` through `booking.listForGuest`.  
**Related references:** `src/app/(guest)/(site)/book/pay/actions.ts:109`; `src/modules/booking/index.ts:306`; `src/modules/booking/read.ts:8`; `src/modules/booking/read.ts:10`; `src/modules/booking/read.ts:16`; `src/modules/booking/read.ts:36`.

**Concrete failure scenario:** A guest with 50 saved bookings submits a new stay or refreshes a hold. The action retrieves 50 booking IDs and awaits `readBooking` for each one before proceeding. Each snapshot fetches the booking row, room lines and nights, plus an optional promo lookup.

For N returned bookings and K bookings with a promo, this is **1 + 3N + K sequential data queries**, plus BEGIN and COMMIT. At the requested limit of 50, the precheck alone performs **151–201 data queries / 153–203 SQL commands**. Confirmed, expired and cancelled history is hydrated even though the guard only needs a matching live HELD booking.

**Why protections fail:** The limit bounds records, not query depth. The loop and each snapshot's awaits run serially on one reserved transaction connection. Wrapping the caller in `Promise.all` does not remove that chain.

**Impact:** This is on the booking submission and refresh critical paths. `docs/tdd-notes.md:199` reports approximately 490 ms per development database round trip and 15–30 second holds. At that reported latency, the 50-booking precheck projects to roughly **75–99 seconds before acquisition**, excluding the acquisition itself. This is a source-based projection, not a latency measurement from this review. The default 20-booking account read also retains 61–81 sequential data queries.

**Expected behaviour:** Checking for an existing hold should have bounded query depth independent of historical booking count.

**Minimal suggested fix:** Query the authenticated guest's matching HELD, unexpired booking directly by dates and stay identity within the atomic reuse/acquire operation from M1. Hydrate only the matched booking. Where full history is needed, batch booking rows, rooms, nights and promo reads rather than awaiting one snapshot per booking. Keep owner predicates intact.

**Verification:** Static SQL/control-flow count. No database benchmark or mutation test was run.

## Database round-trip analysis

### Counting convention and client behaviour

Counts below are derived from the actual source control flow, not measured network traces. The main table **includes SQL transaction-control commands**; data-query counts are shown separately so the totals are reproducible.

- BEGIN and COMMIT each add a sequential command. `insertWithRef` adds one SAVEPOINT before its INSERT. The installed postgres 4.1.0 savepoint implementation does not issue a successful RELEASE SAVEPOINT command.
- Connection establishment, driver type discovery, pool contention, retries, and rendering the redirect destination are excluded from normal-path counts.
- Authentication uses JWT sessions with no configured database adapter, so repeated `requireRole` calls do not add application DB queries here.
- `src/lib/db.ts:11` sets a pool maximum of five. Drizzle's `PostgresJsSession.transaction` calls postgres `begin`; postgres `src/index.js:220` reserves one connection. The awaited queries inside the reviewed transactions are serial.
- Outside transactions, postgres `src/pool.js:269` can distribute queries across connections and pipeline eligible queries, with default `max_pipeline=100`. Therefore a `Promise.all` fan-out counts as one logical dependency layer, but does not prove all statements execute simultaneously. Neither twelve separate awaits nor exactly three network round trips can be inferred just from twelve quotes and a five-connection pool.

Let **p** be 1 when the booking has a promo, otherwise 0. Normal paths have no expired-hold release, retry or reference collision.

| Operation | Sequential depth | Total DB calls | Material batching opportunities |
|---|---:|---:|---|
| `acquireHold` | **16 + 2p** commands; **13 + 2p** data-query layers | **16 + 2p** commands, including **13 + 2p** data queries | Assemble the result from inserted rows and the saved quote rather than re-reading the entire new snapshot. Keep expiry, ordered inventory locking and hash validation in their required order. |
| `payBooking`, new successful payment | **26 + 4p** commands; **20 + 4p** data-query layers | **26 + 4p** commands, including **20 + 4p** data queries | Consolidate repeated owner/snapshot reads. Preserve the atomic confirmation, amount check, unique payment ID and final authoritative outcome. |
| `/rooms` render, seeded 12 plans, no cart / valid cart | **5 / 6** logical command layers; **3 / 4** data-query layers | Warm catalog: **16 / 17** commands (**14 / 15** data queries). Cold catalog: **19 / 20** commands (**17 / 18** data queries). | Plan quotes already use one logical fan-out. Their SQL work is repeated, but this is not a twelve-layer serialized loop. No separate major performance finding is assigned without page timing evidence. |

### 1. acquireHold

Source: `src/modules/booking/hold.ts:34`.

| Step, in order | Data queries | Dependency |
|---|---:|---|
| Scoped expiry probe | 1 | Must settle applicable expired holds before stock evaluation. |
| Ordered inventory SELECT FOR UPDATE, then blackout read | 2 | Stock rows stay locked through the whole transaction. |
| `quoteInTx` | 1 | One pricing-owned statement reads rates, occupancy, tax schedules and promo; its hash must pass before stock is taken. |
| `adjustNights` | 2 | Ordered lock statement, then batched held increment. |
| Promo ID lookup | p | Depends on the accepted quote. |
| Booking INSERT | 1 | SAVEPOINT precedes this; returned booking ID is used below. |
| Room-line INSERT RETURNING | 1 | Needs booking ID; returns room IDs. |
| Night snapshot INSERT | 1 | Needs room IDs. All rooms/nights are batched. |
| HELD event INSERT | 1 | Needs booking ID; same transaction. |
| `readBooking` response | 3 + p | Re-reads booking, rooms, nights and optional promo. |
| **Total data queries** | **13 + 2p** | All awaited in sequence. |

BEGIN, SAVEPOINT and COMMIT add three commands: **16 without promo, 18 with promo**.

If at least one expired booking is released, the expiry helper additionally reads room demand, locks the union of affected/requested inventory, re-locks/updates inventory through `adjustNights`, and inserts expiry events. This adds **five data queries and five sequential commands**, irrespective of the number of released bookings in that batch: **21 / 23 commands** without/with promo.

With no expiry work, sold-out/blackout rejection after stock checks uses **3 data queries / 5 commands** including BEGIN and ROLLBACK. A normal PRICE_CHANGED rejection uses **4 data queries / 6 commands**. Invalid input rejected before opening a transaction uses zero.

A reference collision adds the failed INSERT, its SAVEPOINT and ROLLBACK TO SAVEPOINT before retrying. Transaction conflicts repeat the executed prefix on the documented bounded retry; there is no fixed total for those error paths. No per-night or per-room SQL loop occurs on the successful acquisition path.

### 2. payBooking

Entry: `src/app/(guest)/(site)/book/pay/actions.ts:36`. Supporting paths: `src/modules/booking/index.ts:314`, `src/modules/booking/confirmation.ts:45`, `src/modules/payments/index.ts:44`.

1. The first `ownBooking` calls `booking.get`: owner/ref lookup, booking row, room lines, nights and optional promo = **4 + p data queries**.
2. A successful mock charge invokes the signed handler in process. First confirmation performs: saved booking read (1), payment-ID lookup (1), empty targeted expiry probe (1), guarded booking transition (1), payment INSERT (1), room-demand aggregation (1), inventory lock/update (2), transition event (1), optional promo-use update (p), response snapshot (3 + p). Total **12 + 2p data queries**.
3. `payBooking` discards the handler's detailed outcome through the provider abstraction and calls `ownBooking` again: another **4 + p data queries**.

That gives **20 + 4p data queries**, with six BEGIN/COMMIT commands across three sequential transactions: **26 / 30 commands** without/with promo.

| Alternative path | Data queries | Sequential commands |
|---|---:|---:|
| Initially confirmed, payment gated/ended, mock decline, or mock timeout without webhook | 4 + p | 6 + p |
| Replay where initial read saw HELD but the callback finds the saved provider payment | 14 + 3p | 20 + 3p |
| Concurrent duplicate reaches INSERT conflict, then reads the saved result and rolls back its own transaction | 17 + 3p | 23 + 3p |
| Hold expires after initial read; callback's targeted sweep releases it | 22 + 3p | 28 + 3p |
| Hold expires after an empty sweep; guarded transition settles EXPIRED | 21 + 3p | 27 + 3p |
| Cancellation wins after initial read; callback records a refund without releasing stock again | 17 + 3p | 23 + 3p |

These counts stop at the action result/redirect. The destination page's queries are separate. Expiry-clock/conflict retries add their executed transaction prefixes. There is no query loop in the successful payment path; most state-changing steps are dependent and must retain their transaction/lock guarantees.

### 3. /rooms render

Source: `src/app/(guest)/_components/stay-builder.tsx:30`, reached from `src/app/(guest)/(site)/rooms/page.tsx:20`.

- Initial group (`stay-builder.tsx:93`): catalog and availability start together. A cold catalog performs three independent queries in `catalog/index.ts:44`; a warm catalog performs zero. Availability first runs its expiry transaction, then reads stock: **2 data queries / 4 commands** if nothing expires.
- Plan-price group (`stay-builder.tsx:99`): both room-type and plan loops use `Promise.all`. For Q active plans this performs Q independent one-statement quotes in **one logical application dependency layer**. The seeded catalog has four room types with three plans each: Q = 12.
- Cart quote (`stay-builder.tsx:149`): a valid cart adds one later query; PROMO_INVALID with a supplied code adds another fallback query at line 153. An empty/locally invalid cart adds none.

For catalog-miss indicator m, expiry-work indicator e, and cart quote count c (0, 1, or 2):

- Total data queries: **Q + 2 + 3m + 5e + c**.
- Total SQL commands: **Q + 4 + 3m + 5e + c**.
- Logical data-query depth: **3 + 5e + c**.
- Logical depth including transaction controls: **5 + 5e + c**.

These depth formulas assume at least one active plan and a valid search. With Q=12 and no expiry work, a refused promo's fallback makes depth **7**, with **18 warm / 21 cold commands**. Releasing an expired batch adds five calls/layers. Missing/invalid dates normally short-circuit before SQL; enquiry-only validation branches can load the catalog.

The cart quote currently waits for room-card validation and plan prices. Catalog-dependent quote inputs and expiry-before-stock sequencing are real dependencies. Do not parallelize expiry with stock reads or weaken hold-time locking to lower these counts.

## Scope verification

### Authorisation, reads and entry points

| Area | Boundary traced and result |
|---|---|
| Hold submission and acquisition | `holdStay` validates form/query, requires guest, and `acquireBookingHold` derives guestId from `requireRole("guest")`. A supplied guestId is stripped. Window check is server-side. M1/M2 concern reuse/concurrency and query cost. |
| Pay, check status, refresh | Each action requires guest and calls `booking.get` with the authenticated guest actor. Saved total is passed to the provider. The two-minute pay/refresh gate is rechecked server-side. Refresh creates a fresh order; it does not renew a terminal row. |
| Cancellation | `cancelHeldBooking` validates UUID and derives actor from session. `cancel.ts:29` checks owner before expiry or cancellation writes. Staff/sales cannot use the guest cancellation function. |
| Guest booking details | `loadOwnBooking` checks a guest session and invokes owner-scoped `booking.get`. Other guests' refs return the not-found view. Guests receive their own snapshot without staff events/notes. |
| Calendar export | `booking/[ref]/ics/route.ts:15` requires guest; line 22 checks owner; only CONFIRMED is exported. Response has private/no-store caching. |
| Booking email | Owner lookup precedes rendering; non-confirmed bookings are rejected. This is rendered mock content, with no email sending. |
| A5 list, details and refunds | Every loader independently calls `requireBookingStaff`; only reservations/gm pass. The new module methods recheck actor role before SQL. Sales is denied server-side, including direct page URLs; hiding navigation is supplementary. No A5 mutation actions/API endpoints were found. |
| Dev outbox | `requireDevStaff` enforces flag and staff session inside the page as well as the gate. `listForStaff` separately rejects sales. Contact lookup receives IDs only from an authorised result, or an empty list when denied. |
| Mock payment webhook | Raw body HMAC is checked before JSON processing/state change. Missing/short secret and malformed/invalid signature fail closed; comparison uses `timingSafeEqual`. The route's Zod/role exemption is explicitly documented. |
| Cron expiry | Bearer authentication uses constant-time digest comparison and fails closed before the site-wide sweep. Availability's separate lazy sweep is scoped to its dates/types. |

The legacy ordinary `booking.get` service accepts a sales actor, but all discovered external callers pass an authenticated **guest** actor. A5 uses the stricter new staff methods. No reachable sales bypass was established; this is not a claim that the legacy method itself enforces the A5 role policy.

### Additional read helpers: every current call site

| Helper | Entry points and SQL scoping |
|---|---|
| `refundPendingForGuest` — `src/modules/booking/index.ts:275` | Called only by `account/page.tsx:54`, after its guest-session gate, and `booking/[ref]/page.tsx:29`, after `loadOwnBooking`. Both pass session `user.id`. The distinct-ID query joins payments to bookings and filters both `bookings.guest_id` and REFUND_PENDING. It returns booking IDs, with no contact details, provider IDs or notes. It is a trusted server helper, not a `use server` export accepting client-selected guest IDs. |
| `getForStaff` — `src/modules/booking/index.ts:252` | Its sole page caller is `admin/(app)/bookings/[ref]/page.tsx:32`, after `requireBookingStaff`. Module role guard runs before SQL. Booking ref selects one order; rooms/nights, timeline and payments are restricted to that order's IDs. Cross-guest access is intentional for reservations/gm; sales/guests are refused. |
| `listRefundPending` — `src/modules/booking/index.ts:260` | Its sole page caller is `admin/(app)/bookings/page.tsx:145`, after `requireBookingStaff`. Module role guard runs before SQL. Payments join to their booking ref, filter REFUND_PENDING, sort newest first and apply the validated limit (1–200; page requests 100). This is an authorised global staff list, with no guest-facing caller or filtering that bypasses the role guard. |

### Money and transactional invariants

- `payBooking` uses saved `b.totalPaise`, never a browser amount. `confirmation.ts:54` compares callback amount to saved booking total before state changes; payment INSERT uses that saved total. Guest confirmation/email derive prices from frozen snapshots.
- Currency is implicitly INR/paise throughout this mock contract. There is no explicit currency field/check to test, and no supported foreign-currency processing path was found. This review does not validate a future real gateway's currency handling.
- Attempt IDs generate deterministic, normalized provider IDs. The unique payment constraint plus provider/booking/amount checks make replays idempotent. A conflicting concurrent insert rolls its tentative transaction back before returning the saved outcome.
- Only SUCCESS callbacks are accepted. Failed/timeout mock outcomes send no callback and do not change persisted successful payments. Distinct extra successes after confirmation are recorded for refund, without selling inventory again.
- Cancellation, expiry and confirmation arbitrate through guarded booking-row transitions before inventory adjustment. If cancellation wins, confirmation records REFUND_PENDING; if confirmation wins, cancellation returns NOT_HELD. Expiry uses SKIP LOCKED and conditional HELD transitions. Stock and events are in the same transaction as the winning transition.
- Confirmation rechecks the database clock after the booking update and rolls back/retries a lock wait crossing the deadline. EXPIRED/CANCELLED remain terminal.
- Multi-room acquisition locks all requested inventory in SQL order, checks aggregate per-type demand, and uses batched adjustments/inserts. Sentinel failures roll back pricing/hash/stock failures, including any preceding expiry work. No partial multi-room acquisition or over-allotment interleaving was established. M1 is duplicate reservation intent within available allotment.

### Documentation and verification limits

Required documents, the branch's changed source/tests/configuration, and supporting auth, schema, pricing, inventory, expiry, confirmation and client code outside the diff were inspected. The binary screenshot additions were inventoried, not treated as independently verified runtime evidence.

The documented reuse guarantee is contradicted by M1. The recorded query-batching follow-up materially affects the new prechecks as described in M2. At the reviewed SHA, `s2-booking-handoff.md` still contains commit/open-item placeholders. The added guest refund helper is explicitly marked in `01-booking-core.md` as needing scrum-master sign-off; this review does not grant contract approval.

Production deployment values and database target isolation were not inspected. Dev tools rely on their flag; the mock provider/webhook use the configured application database and do not contain a production-target veto. The requirements intentionally specify mock payments, so absence of a real charge is not itself classified as a payment defect here. HMAC authentication does not certify that deployment credentials point to a safe database.

Existing PostgreSQL cancellation, duplicate/late payment and multi-room race tests were inspected but **not run**, as required. Unit mocks and the action harness do not prove PostgreSQL isolation behaviour.

## Final release recommendation

**FIX MAJORS:** Address M1 and M2 before release, then verify concurrent submit/refresh reuse and bounded query counts on an isolated database when it becomes available. Retain the existing ownership, payment idempotency and inventory transaction protections.

This review implemented no fixes, changed no production code, and performed no merge, push or deployment.