# S0 handover (read-only review)

Reviewed on 2026-11-07 from the working tree. Every claim below comes from a file I read or a command I ran. I did not change source, schema or docs. I ran `typecheck`, `lint`, `test` and `build`, plus one read-only SELECT script against the dev database. I did **not** run `pnpm test:integration`, `db:seed`, `db:migrate` or `db:reset`: the integration suite re-seeds the database it points at (`tests/integration/seed.test.ts` runs `pnpm db:seed` twice, and the seed TRUNCATEs every table).

**Status labels**
- **REAL**: implemented and covered by a test that I saw pass, or checked directly against the database.
- **REAL-UNTESTED**: implemented, but no test exercises it. It may still compile and build.
- **STUB**: the signature is real, the body returns fixtures.
- **NOT BUILT**: absent.

---

## 1. Repo state

| Item | Value |
|---|---|
| Branch | `claude/dev` (git worktree; main branch is `main`) |
| HEAD | `b03fbf47da5f9977dd14e4d232f6d25266387f14` |
| `git status` | clean at start (empty `--short`) and after my checks. `docs/s0-handover.md` is the only change, committed alone |
| Nothing pushed | CI has never run on GitHub (`06-progress.md` open question 4) |

S0 commits (oldest first, all dated 2026-11-07; `ea9db4b` is the pre-S0 skeleton):

```
ea9db4b starting skeleton
48f3cc1 chore(scaffold): next app router, tailwind, shadcn, vitest, folder layout        F1
48ea1e3 feat(contracts): frozen module interfaces and fixtures                            C1
0f198e2 feat(pricing): quoteHash contract, tests and booking-core notes                   C2
47864f4 feat(db): drizzle schema, migration and constraint tests                          F2
37401ef feat(db): idempotent seed with rates, inventory, bookings and labelled enquiries  F3
ea9b2d8 feat(auth): credentials login, role guards, guest sign up and demo logins         F4
bfc600f ci: typecheck, lint, unit, build and Postgres integration jobs                    F5
ea52d11 feat(ui): design tokens, Fraunces, layout shells, component kit and /dev/ui       F7
b03fbf4 docs: S0 summary, decisions log and TDD notes                                     D1
```

F6 (deploy to Vercel + Neon) is **NOT BUILT** (`06-progress.md`: todo). `docs/06-progress.md` lists everyone in the Locks table as "Claude Code (S0)". That ownership should be handed back before S1 starts.

## 2. Command results

| Command | Result | Evidence |
|---|---|---|
| `pnpm typecheck` (`tsc --noEmit`) | **PASS**, exit 0 | no diagnostics |
| `pnpm lint` (`eslint`) | **PASS**, exit 0 | no output, so 0 errors and 0 warnings |
| `pnpm test` (`vitest run --project unit`) | **PASS**: 7 files, **31/31 tests** | duration ~0.5 s, no DB needed |
| `pnpm build` (`next build`, Next 16.4.5 Turbopack) | **PASS**, exit 0 | 11 static pages generated, `ƒ Proxy (Middleware)` present |
| `pnpm format:check` | not run | CI runs it; `06-progress.md` says it passes |
| `pnpm test:integration` | **not run by me** (mutates DB) | `06-progress.md` reports 13 passing. I count 13 tests in the 3 files (schema 4, seed 5, auth 4). That is a claim, not my evidence |
| DB connect | **PASS** (read-only) | connected using `DATABASE_URL` from `.env.local`; host not recorded here. The script was a temp file, deleted afterwards |

Read-only DB facts (information_schema, pg_constraint, pg_indexes, `count(*)`):
- 19 tables in `public`, **23 CHECK constraints**, **6** named `*_idx` indexes, **1** row in `drizzle.__drizzle_migrations`.
- Row counts: users 5, room_types 4, room_photos 12, rate_plans 12, daily_rates 2160 (= 12 x 180), inventory 720 (= 4 x 180), tax_slabs 2, promo_codes 3, blackout_dates 2, bookings 30, booking_nights 68, booking_events 60, payments 21, enquiries 30, enquiry_events 29, event_details 1, notifications 9, reply_drafts 0, export_runs 0.

Unit tests by file (all pass):

| File | Tests | What it checks |
|---|---|---|
| `src/modules/pricing/hash.test.ts` | 4 | hash deterministic; changes with rate, GST slab, promo/plan/dates |
| `tests/unit/contracts.test.ts` | 10 | fixture arithmetic, stub results and error codes, 76 keys, brief enquiries verbatim |
| `src/lib/auth/guards.test.ts` | 3 | pure `assertRole` and `assertGuestOwner` |
| `src/lib/auth/safe-next.test.ts` | 2 | open-redirect guard |
| `src/lib/money.test.ts` | 3 | INR format, basis points, rejects non-integers |
| `src/lib/dates.test.ts` | 4 | calendar validation, nights, IST today, formatting |
| `src/db/seed/pricing.test.ts` | 5 | seed-local slab boundary, weekend/season, exact discount split, GST after discount, determinism |

## 3. Directory tree

Excluded: `node_modules`, `.next`, `*.tsbuildinfo`, lockfile, `public/images/*.jpg` (19 files), `.gitkeep`. From `git ls-files`.

```
.
├─ AGENTS.md, CLAUDE.md, README.md
├─ package.json, pnpm-lock.yaml, pnpm-workspace.yaml
├─ tsconfig.json, next.config.ts, eslint.config.mjs, vitest.config.mts, drizzle.config.ts
├─ components.json (shadcn), docker-compose.yml, .env.example, .gitignore, .prettierrc
├─ .github/workflows/ci.yml
├─ docs/  00-requirements … 07-backlog, tdd-notes.md, s0-handover.md, screenshots/F7.png
├─ scripts/optimize-images.mjs
├─ tests/
│  ├─ unit/contracts.test.ts
│  └─ integration/ helpers.ts, schema.test.ts, seed.test.ts, auth.test.ts
└─ src/
   ├─ proxy.ts                         redirect-only route guard (Next 16 name for middleware)
   ├─ app/
   │  ├─ layout.tsx, globals.css       Fraunces font, tokens, ToastProvider
   │  ├─ (guest)/(site)/  layout.tsx, page.tsx (placeholder home), account/page.tsx
   │  ├─ (guest)/(auth)/  login/page.tsx, signup/page.tsx
   │  ├─ (staff)/admin/(app)/  layout.tsx (role gate), page.tsx (empty overview)
   │  ├─ (staff)/admin/(auth)/login/page.tsx
   │  ├─ api/auth/[...nextauth]/route.ts
   │  ├─ api/{cron,inbound/email,inbound/whatsapp,payments/mock}/   empty (.gitkeep)
   │  └─ dev/ui/ page.tsx, showcase.tsx, guest/page.tsx, staff/page.tsx   (noindex review pages)
   ├─ components/
   │  ├─ layout/ auth-layout, guest-shell, staff-shell, staff-nav, wordmark
   │  └─ ui/ button, input, select, stepper, date-range, card, badge, step-indicator,
   │         price-block, hold-timer, skeleton, empty-state, error-state, toast, data-grid, index
   ├─ db/
   │  ├─ schema/ identity, catalog, inventory, booking, enquiries, index
   │  ├─ migrations/ 0000_dashing_mephistopheles.sql, meta/
   │  ├─ migrate.mts, reset.mts
   │  └─ seed/ index.ts (480 lines), data.ts, enquiries.data.ts, pricing.ts, pricing.test.ts
   ├─ lib/
   │  ├─ auth/ config, credentials, guards, actions, auth-form, safe-next, types (+2 tests)
   │  ├─ db.ts, dates.ts, money.ts, result.ts, site.ts, utils.ts (+ tests for dates, money)
   └─ modules/
      ├─ pricing/    index, types, hash, fixtures (+ hash.test)
      ├─ inventory/  index, fixtures        [LOCKED]
      ├─ booking/    index, fixtures        [LOCKED]
      ├─ payments/   index (interface only) [LOCKED]
      ├─ enquiries/  index, fixtures
      ├─ ai-router/  index, fixtures
      ├─ catalog/    index, fixtures        (read-only addition, not in 02's original list)
      └─ admin/      index.ts = `export {}`
```

## 4. Per story

**Concept: contract-first.** The frozen `index.ts` files fix the shape of every module call. UI is built against `fixtures.ts` and the real implementation is swapped in later without changing callers.

### F1 Scaffold: REAL
- Files: `package.json`, `tsconfig.json` (strict), `next.config.ts` (`cacheComponents`, `partialPrefetching`), `eslint.config.mjs`, `vitest.config.mts` (two projects: `unit`, `integration`), `docker-compose.yml`, module folders.
- Evidence: typecheck, lint, test and build all pass above.
- Not covered: no test checks the folder layout. Prettier is configured but I did not run it.
- Deviation: the stack is newer than the docs assume (Next 16.4.5, React 19.3, `next-auth` 5.0.0-beta.32, Zod 4, Vitest 5). `cacheComponents` is on, so any page reading cookies, `searchParams` or the clock must sit inside `<Suspense>` (recorded in the decisions log).

### C1 Frozen interfaces: contracts REAL, implementations **STUB**
- Files: `src/modules/*/index.ts` (signatures and Zod input schemas), `fixtures.ts` (308 lines in total).
- Tests: `tests/unit/contracts.test.ts`. It checks that fixture totals add up, stubs return `{ok:false, code}` instead of throwing, the `PRICE_CHANGED` path, owner-only `booking.get`, and the 3 brief enquiries verbatim.
- Does NOT cover: any real behaviour. It proves the stubs agree with their own fixtures, nothing about inventory, DB or pricing correctness.
- Deviations from `07-backlog.md` C1:
  1. `acquireHold` takes `{ stay, quoteHash, guestId }`, not `acquireHold(quoteHash)`. Recorded in `01` Contract notes. Needs scrum master sign-off (open question 5).
  2. `confirmPayment` returns `ok:true` with `outcome: REFUND_PENDING` for late payment. Same sign-off.
  3. Added beyond the C1 list: `enquiries.list()`, the whole `catalog` module, the `PaymentProvider` interface, and `booking.get(input, actor)` with an actor argument.
  4. `payments/index.ts` is an interface only; there is no MockProvider (B7).
  5. `releaseExpiredHolds` (B4) is not in any contract yet.

### C2 Quote, hold and payment price contract: `quoteHash` REAL, everything around it **STUB**
- Files: `src/modules/pricing/{types,hash,index,fixtures}.ts`, `src/modules/booking/index.ts`.
- Tests: `hash.test.ts` (4) and the `PRICE_CHANGED` and `AMOUNT_MISMATCH` stub tests.
- Does NOT cover: hash recomputation inside a transaction. The stub `acquireHold` just tests the literal string `"stale"`. `pricing.quote()` returns the fixture with the caller's room, plan and dates pasted over it, so its price is wrong for any other stay.
- Deviation: none against `01`. The hash covers per-night GST **basis points** rather than the slab table. That is equivalent for detecting a slab change.

### F2 Schema and migrations: REAL
- Files: `src/db/schema/*.ts` (5 files), `src/db/migrations/0000_*.sql`, `drizzle.config.ts`, `migrate.mts`, `reset.mts`, `src/lib/db.ts`.
- Evidence: the live DB has 19 tables and 23 CHECKs (query above). The migration SQL contains every CHECK and index (section 6). `schema.test.ts` (4 integration tests) proves that sold+held>allotment, bad role, `total_units=0`, bad plan code, price 0, backwards blackout, bad promo kind, backwards booking dates, bad booking status, `units=0`, duplicate `provider_payment_id`, bad channel and bad lane are all rejected.
- Does NOT cover: `promo_codes` value and used_count checks, `payments_status_check`, `enquiries_category/ai_status/status` checks, `enquiry_events_action`, `notifications_kind`, FK cascade and restrict behaviour, rollbacks of a half-applied migration.
- Deviations: none from `03`. No indexes on FK columns such as `payments.booking_id`; the docs list none and none were added (open question 3). There is no `ON DELETE` on `bookings` and `payments` FKs (so deletes are blocked, which suits an audit trail).

### F3 Seed: REAL
- Files: `src/db/seed/{index,data,enquiries.data,pricing}.ts`. Truncates all tables, then rebuilds. Deterministic PRNG (seed `20261107`). Dates are relative to the day it runs.
- Evidence: DB counts match the AC (30 bookings, 30 enquiries, 12 photos, 12 plans, 2160 rates, 720 inventory, 2 slabs, 3 promos, 5 users). `seed.test.ts` (integration) checks idempotence by running twice, the 4 room types and 76 keys, allotment <= total units, that inventory sold/held reconcile with the bookings, that totals equal nights, all 4 booking statuses present, and the 3 brief enquiries verbatim. I did not re-run it.
- Does NOT cover: enquiry label correctness against any classifier (R5 will), that rates look sensible, `reply_drafts` and `export_runs` (empty by design).
- Deviation: price maths in `seed/pricing.ts` duplicates what `modules/pricing` must do. It conflicts with CLAUDE.md rule 6 ("prices only in pricing"), but is documented as seed-local. **B1 must make `pricing.quote()` agree with it, or the seeded `total_paise` values become inconsistent.**
- Safety: `seed` and `reset` refuse `NODE_ENV=production` and hosts in `DB_PROTECTED_HOSTS`. That variable is empty by default (`.env.example`), so the host guard is off until someone fills it.

### F4 Auth and roles: credentials check REAL, the rest **REAL-UNTESTED**
- Files: `src/lib/auth/{config,credentials,guards,actions,auth-form,safe-next,types}.ts`, `src/proxy.ts`, login and signup pages, `(app)/layout.tsx`, `account/page.tsx`.
- REAL (tested): `verifyCredentials` with 4 integration tests (right password, wrong password, unknown email, staff and guest logins kept separate, malformed input); `assertRole` and `assertGuestOwner` (3 unit tests); `safeNext` (2).
- REAL-UNTESTED: `guestSignUpAction` (Zod, consent, `onConflictDoNothing` on email, auto sign-in), `guestLoginAction` and `staffLoginAction`, the JWT `jwt` and `session` callbacks, `proxy.ts` redirects, and the layout gates. I saw them compile and build, not run.
- Not covered by tests: `requireRole` and `requireGuestOwner` themselves (only the pure helpers are). **Nothing in `src` calls them yet**; the admin layout uses `getSessionUser()` and a manual role check.
- Deviations: CLAUDE rule 5 asks every action to call a role guard. The four auth actions are public (login, sign up, sign out), validated with Zod, and say so in a comment. No rate limiting, no security headers (deferred to H2). Sessions are JWT, 8 hours.

### F5 CI: **REAL-UNTESTED**
- File: `.github/workflows/ci.yml`. Job 1: install, typecheck, lint, format:check, test, build. Job 2: Postgres 16 service, `db:migrate`, `test:integration`.
- Evidence: the steps map to commands I ran locally (except `format:check` and integration). It has never run on GitHub. Possible first-run risk: `pnpm/action-setup@v4` and the `packageManager` pin. `pnpm@12.18.0` should be checked.
- Does NOT cover: Playwright (H1), deploy, Lighthouse.

### F7 UI kit: **REAL-UNTESTED**
- Files: `src/components/ui/*` (16 files, 883 lines), `src/components/layout/*`, `src/app/globals.css`, `/dev/ui`, `/dev/ui/guest`, `/dev/ui/staff`, `docs/screenshots/F7.png`.
- Evidence: the build prerenders `/dev/ui`, `/dev/ui/guest` and `/dev/ui/staff`. A screenshot exists. All components named in the F7 AC are present: Button, Input, Card, Skeleton, EmptyState, ErrorState, Toast. There are also Select, Stepper, DateRange, Badge, StepIndicator, PriceBlock, HoldTimer and DataGrid.
- Does NOT cover: any component test, accessibility audit or 375px audit (explicitly left to H4). `/dev/ui` uses `quoteFixture` from `@/modules/pricing`. It is the only place in `src/app` or `src/components` that imports a module.
- Not built (as the S0 scope says): the home page is a title plus tagline placeholder, `/admin` is an empty state, the account page shows "no bookings".

### D1 TDD notes: REAL
- File: `docs/tdd-notes.md`, 49 lines, entries for F1, C1, C2, F2, F3, F4, F5, F7, D1, each with What, Why and Tradeoffs. F6 has no entry because it was not built.

## 5. Contracts

**Result convention** (`src/lib/result.ts`): `Ok<T> = {ok:true} & T` and `Err<C, X> = {ok:false; code:C} & X`. Business failures are **returned**, never thrown, so TypeScript forces callers to handle each code.

| Module | Function | Signature | Success | Error codes |
|---|---|---|---|---|
| pricing | `quote(input: QuoteInput)` | `Promise<QuoteResult>` | `{ok, quote}` | `INVALID_INPUT`, `NO_RATE`, `PROMO_INVALID`, `OVER_OCCUPANCY` |
| inventory | `availability(input: AvailabilityInput)` | `Promise<AvailabilityResult>` | `{ok, rooms: RoomAvailability[]}` | `INVALID_INPUT` |
| booking | `acquireHold(input)` | `Promise<AcquireHoldResult>` | `{ok, booking}` | `INVALID_INPUT`, `SOLD_OUT`, `BLACKOUT`, `NO_RATE`, `PRICE_CHANGED` (carries `quote`) |
| booking | `confirmPayment(input)` | `Promise<ConfirmPaymentResult>` | `{ok, outcome, booking}` | `INVALID_INPUT`, `NOT_FOUND`, `AMOUNT_MISMATCH` |
| booking | `get(input, actor: BookingActor)` | `Promise<GetBookingResult>` | `{ok, booking}` | `INVALID_INPUT`, `NOT_FOUND`, `FORBIDDEN` |
| enquiries | `ingest(input)` | `Promise<IngestResult>` | `{ok, enquiryId, aiStatus:'pending'}` | `INVALID_INPUT` |
| enquiries | `list()` | `Promise<Enquiry[]>` | array | none (not in C1 list) |
| ai-router | `process({enquiryId})` | `Promise<ProcessResult>` | `{ok, status:'ok'|'fallback', classification, lane, ownerRole, notifyGm}` | `INVALID_INPUT`, `NOT_FOUND`, `FAILED` |
| catalog | `listRoomTypes()`, `getRoomTypeBySlug(slug)` | `RoomType[]`, `RoomType | null` | n/a | read-only addition |
| payments | `PaymentProvider.charge({bookingId, amountPaise})` | `Promise<PaymentOutcome>` | `SUCCESS`, `FAILED`, `TIMEOUT` | interface only |
| admin | none | `export {}` | | |

Input schemas (Zod, in each `index.ts` or `types.ts`):
- `quoteInputSchema`: `roomTypeId`, `ratePlanId`, `checkIn`, `checkOut` (real calendar date, must be after check-in), `adults` 1 to 10, `children` 0 to 10 (default 0), optional `promoCode` (trimmed, 1 to 32 chars).
- `acquireHoldInputSchema`: `{ stay: quoteInput, quoteHash, guestId }`.
- `confirmPaymentInputSchema`: `bookingId`, `provider`, `providerPaymentId`, `amountPaise` (positive integer).
- `availabilityInputSchema`: optional `roomTypeId`, dates, `units` pinned to exactly 1 in the MVP.

### The `Quote` type
`{ roomTypeId, ratePlanId, checkIn, checkOut, nights: QuoteNight[], promo: {code, kind:'pct'|'flat', value}|null, subtotalPaise, discountPaise, gstPaise, totalPaise, quoteHash }`.
`QuoteNight` = `{ date, ratePaise, discountPaise, gstBp, gstPaise }`. All money is integer paise. `totalPaise = subtotal - discount + gst`, and the type comment calls it "the only amount a payment may charge". The unit tests check that the arithmetic holds for the two fixtures.

### `quoteHash` (`src/modules/pricing/hash.ts`)
- **Why:** it ties the price the guest saw to the price a hold is taken at, so a rate or slab edit between the two cannot slip through silently.
- **What goes in:** SHA-256 over `JSON.stringify([roomTypeId, ratePlanId, checkIn, checkOut, promo ? [code, kind, value] : null, nights.map(n => [date, ratePaise, discountPaise, gstBp])])`, first **32 hex chars** kept.
- **What does not:** occupancy (adults and children), derived totals, `gstPaise`. Totals derive from the inputs, so excluding them is safe provided the rounding rule stays fixed. Note the promo `value` is in the hash but promo `maxUses` and validity are not.
- **When checked:** per `01` step 4, `acquireHold` recomputes `pricing.quote()` **inside the hold transaction** and compares. **Currently nothing checks it for real**: the stub compares against the literal `"stale"`. The stored `bookings.quote_hash` column is `NOT NULL`, and the seed fills it using the real function.

### `acquireHold` result (`AcquireHoldResult`)
- `{ ok:true, booking: Booking }`. `Booking.status` is `'HELD'`, `holdExpiresAt` an ISO string, with the frozen price snapshot (`nights`, `subtotalPaise`, …, `totalPaise`) and `quoteHash`.
- `{ ok:false, code: 'INVALID_INPUT' | 'SOLD_OUT' | 'BLACKOUT' | 'NO_RATE' }`.
- `{ ok:false, code: 'PRICE_CHANGED', quote: Quote }`: no hold is taken; the UI shows "price updated" with the new quote.
- Documented but not in the type: a deadlock retried once, then reported as `SOLD_OUT` (`01`, step 6).

### `confirmPayment` result (`ConfirmPaymentResult`)
- `{ ok:true, outcome: 'CONFIRMED' | 'ALREADY_CONFIRMED' | 'REFUND_PENDING', booking }`.
  - `CONFIRMED`: this call moved HELD to CONFIRMED.
  - `ALREADY_CONFIRMED`: duplicate webhook, no-op.
  - `REFUND_PENDING`: paid after expiry; the booking stays EXPIRED, the payment row is `REFUND_PENDING`, inventory untouched. It is an **ok** outcome, not an error. This differs from the backlog wording and needs sign-off.
- `{ ok:false, code: 'INVALID_INPUT' | 'NOT_FOUND' | 'AMOUNT_MISMATCH' }`.
- The stub only returns `CONFIRMED` or `AMOUNT_MISMATCH` or `INVALID_INPUT`. `ALREADY_CONFIRMED`, `REFUND_PENDING` and `NOT_FOUND` are in the type but nothing returns them yet.

## 6. Database

Source: `src/db/schema/*.ts`, cross-checked against `0000_dashing_mephistopheles.sql` and the live DB. All 23 CHECKs and 6 indexes in the schema appear in the SQL, and `pg_constraint` reports 23 CHECKs live. Every PK is `uuid default gen_random_uuid()` unless stated. Money columns are `integer` paise (max about ₹2.1 crore per value).

| # | Table | Purpose | Key columns | FKs (on delete) | CHECK constraints | Indexes (besides PK/UNIQUE) |
|---|---|---|---|---|---|---|
| 1 | users | guests and staff | email UNIQUE, password_hash, role, consent_at, consent_version | none | `users_role_check` role IN guest/reservations/sales/gm | none |
| 2 | room_types | sellable room types | slug UNIQUE, total_units, max_adults, max_children, amenities jsonb | none | `room_types_total_units_check` > 0 | none |
| 3 | room_photos | gallery | url, alt, width, height, blur_data, sort | room_type_id → room_types (cascade) | none | none |
| 4 | rate_plans | EP, CP, MAP per room | code, name, inclusions, refundable, active | room_type_id → room_types (cascade) | `rate_plans_code_check` IN EP/CP/MAP | none |
| 5 | daily_rates | price per room, plan and date | PK(room_type_id, rate_plan_id, date), price_paise | room_type_id (cascade), rate_plan_id (cascade), updated_by → users | `daily_rates_price_check` > 0 | PK only |
| 6 | tax_slabs | GST slabs | min_paise, max_paise (null = no cap), gst_bp, effective_from | none | none | none |
| 7 | promo_codes | promos | code UNIQUE, kind, value, valid_from/to, min_nights, max_uses, used_count, active | none | `_kind_check` pct/flat; `_value_check` > 0; `_used_count_check` >= 0 | none |
| 8 | inventory | per room, per night stock | PK(room_type_id, date), allotment, sold, held | room_type_id → room_types (cascade) | `allotment >= 0`, `sold >= 0`, `held >= 0`, **`inventory_capacity_check` sold + held <= allotment** | PK only |
| 9 | blackout_dates | closed ranges | room_type_id (null = all), start_date, end_date, reason | room_type_id (cascade), created_by → users | `blackout_dates_range_check` end >= start | none |
| 10 | bookings | the booking and its price snapshot | ref UNIQUE, guest_id, room_type_id, rate_plan_id, check_in/out, units, adults, children, status, hold_expires_at, quote_hash, promo_id, subtotal/discount/gst/total_paise | guest_id → users, room_type_id, rate_plan_id, promo_id (all no action) | `units >= 1`; status IN HELD/CONFIRMED/EXPIRED/CANCELLED; `check_out > check_in` | `bookings_status_hold_idx` (status, hold_expires_at); `bookings_guest_idx` (guest_id); `bookings_check_in_idx` (check_in) |
| 11 | booking_nights | per night price snapshot | PK(booking_id, date), rate_paise, discount_paise, gst_bp, gst_paise | booking_id → bookings (cascade) | none | PK only |
| 12 | payments | payment attempts | booking_id, provider, provider_payment_id **UNIQUE**, amount_paise, status | booking_id → bookings (no action) | `payments_status_check` SUCCESS/FAILED/REFUND_PENDING | none |
| 13 | booking_events | state change audit | booking_id, from_status, to_status, actor, note, at | booking_id → bookings (cascade) | none | none |
| 14 | enquiries | one inbox for all channels | id **text** PK (ENQ-xxxx), channel, sender_name, sender_contact, raw_text, category, confidence numeric(3,2), extracted jsonb, ai_status, ai_attempts, ai_last_error, ai_updated_at, lane, owner_id, status, is_complaint, first_reply_at | owner_id → users (no action) | channel IN web/email/whatsapp/event_form; category null or IN 5 values; ai_status IN 5 values; lane IN sorted/unsorted; status IN new/assigned/replied/closed | `enquiries_lane_status_idx`; `enquiries_owner_status_idx` (owner_id, status); `enquiries_ai_status_idx` (ai_status, ai_updated_at) |
| 15 | event_details | wedding or event fields | enquiry_id PK, event_type, date_from/to, guests, budget_paise, needs jsonb | enquiry_id → enquiries (cascade) | none | none |
| 16 | reply_drafts | AI reply drafts | enquiry_id, body, quote jsonb, provider, model, prompt_version, edited, approved_by, sent_at | enquiry_id (cascade), approved_by → users | none | none |
| 17 | enquiry_events | routing audit | enquiry_id, actor, action, from_value, to_value, at | enquiry_id → enquiries (cascade) | `enquiry_events_action_check` classified/rerouted/edited/sent/closed | none |
| 18 | notifications | GM bell | user_id, enquiry_id, kind, read_at | user_id (cascade), enquiry_id (cascade) | `notifications_kind_check` complaint/unsorted | none |
| 19 | export_runs | daily CSV idempotence | run_date UNIQUE, row_count, file_url | none | none | none |

Sanity totals: CHECKs 1+1+1+1+3+4+1+3+1+5+1+1 = **23**. Tables = **19**.

Things to know:
- **Dates** are `date` columns in `mode:"string"`. They arrive in TypeScript as `"YYYY-MM-DD"` strings, which is why `src/lib/dates.ts` works on strings. IST is a convention (`todayIST`), not a column type.
- **No constraint** enforces `total_paise = subtotal - discount + gst`, `payments.amount_paise = bookings.total_paise`, or "HELD requires `hold_expires_at`". Those are app rules for B3 and B5.
- `enquiries.confidence` is `numeric(3,2)`. Drizzle returns it as a **string**, while the `Enquiry` contract says `number | null`. The real `enquiries` module will need an explicit conversion.
- The enquiry id `ENQ-xxxx` is a plain `text` PK. **No sequence or generator exists**; Q1 has to produce unique ids.
- Seed room ids are UUIDs, while fixture ids are strings like `rt-plantation-room`. The contract types say `string`, so both fit, but any UI that hard-codes fixture ids breaks when it switches to the DB.

## 7. Request flow

```
Browser ─▶ proxy.ts ─▶ Next route (layout/page) ─▶ [server action | route handler] ─▶ module index.ts ─▶ DB
             │ cookie present? else redirect to /login or /admin/login (redirect only)
```

1. **`src/proxy.ts`** matches `/admin/:path*` and `/account/:path*`. It checks only whether an `authjs.session-token` cookie **exists**. It does not verify it, and it exempts `/admin/login`. It is a convenience redirect, not security.
2. **Real authorization** happens one layer in:
   - `(staff)/admin/(app)/layout.tsx` calls `getSessionUser()` and redirects unless the role is in `STAFF_ROLES`.
   - `account/page.tsx` redirects unless the role is `guest`.
   - Server actions and route handlers should call `requireRole(...)` or `requireGuestOwner(id)`. They throw `AccessError` (`UNAUTHENTICATED` or `FORBIDDEN`) and `accessErrorResponse()` turns it into 401 or 403. **Nothing calls them today**, because no protected action or handler exists yet.
3. **Login:** `staffLoginAction` and `guestLoginAction` validate with Zod, then call Auth.js `signIn("staff"|"guest")`. These are two separate Credentials providers, each restricted to its allowed roles by `verifyCredentials(…, roles)`. The redirect target goes through `safeNext`. Unknown emails still run a bcrypt compare against a dummy hash, to flatten timing.
4. **Sessions:** JWT, 8 hours. `jwt` and `session` callbacks copy `uid` and `role` onto the session.
5. **Modules:** called only through `index.ts` (rule 4). Cross-module fixtures are re-exported from the owning `index.ts`.
6. **Fixtures vs real DB** right now:
   - **Fixtures:** `pricing`, `inventory`, `booking`, `enquiries`, `ai-router`, `catalog`. Only `/dev/ui` calls a module (`quoteFixture`).
   - **Real DB:** auth only (`users` read in `verifyCredentials`, written by `guestSignUpAction`), plus the seed, migrate and test scripts. `getDb()` creates a lazy `postgres-js` client with `prepare:false` (needed for Neon's pooled endpoint).
   - Page content such as the home page and the admin overview is static placeholder copy.

## 8. Environment variables (names only)

| Name | Purpose | Used in code today |
|---|---|---|
| `DATABASE_URL` | pooled Postgres URL for the app | `src/lib/db.ts`, scripts |
| `DATABASE_URL_UNPOOLED` | migrations and seed | `drizzle.config.ts`, `db/*.mts`, `seed`, test helpers |
| `AUTH_SECRET` | Auth.js signing key (read by next-auth itself) | implicit |
| `TEST_DATABASE_URL` | integration tests. If unset they fall back to `DATABASE_URL_UNPOOLED`, then `DATABASE_URL`, **which can be the dev DB** | `tests/integration/*` |
| `DB_PROTECTED_HOSTS` | comma list of hosts that `seed` and `reset` refuse | `seed/index.ts`, `reset.mts` |
| `AI_PROVIDER`, `AI_MODEL`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`, `LOCAL_AI_BASE_URL` | AI router (R1) | not yet |
| `INBOUND_WEBHOOK_SECRET` | secret header on simulated email and WhatsApp webhooks (Q3) | not yet |
| `CRON_SECRET` | Vercel Cron auth (B4) | not yet |
| `HOLD_MINUTES` | hold length, default 10 | not yet (seed hard-codes 10 minutes) |

Findings:
- `.env.example` has 13 names and no values (except the defaults `AI_PROVIDER=google`, `LOCAL_AI_BASE_URL=http://localhost:11434/v1`, `HOLD_MINUTES=10`).
- **`.env.local` is gitignored:** `git check-ignore -v .env.local` → `.gitignore:43:.env.local`, via the `.env*` rule. `git ls-files | grep env` lists only `.env.example`.
- **No secrets tracked.** My `git grep` for DB URLs with credentials, `AUTH_SECRET=` with a value, `sk-…` and `AIza…` keys and quoted `api_key` strings matched only: the CI Postgres service URL (`resort:resort@localhost`, a throwaway container credential, in `ci.yml:50` and `README.md:17`) and the CI `AUTH_SECRET: ci-placeholder-not-a-secret`. The demo password `Demo@12345` is committed on purpose (`seed/data.ts`, README) and is only for seeded dev data.
- Caveat: `.env*` also ignores `.env.example`. It is tracked, so it was force-added; a future edit still works, but a new `.env.something.example` would need `git add -f`.
- `docs/02-architecture.md` lists the same names as `.env.example` except `DB_PROTECTED_HOSTS`, which is missing there (CLAUDE.md rule 7 wants both updated).

## 9. Acceptance criteria

| Story | AC (short) | File(s) | Evidence | Status |
|---|---|---|---|---|
| F1 | Next + TS strict, Tailwind, shadcn, ESLint, Prettier, Vitest, scripts, module folders with `index.ts` | `package.json`, `tsconfig.json`, `components.json`, `vitest.config.mts`, `src/modules/*` | typecheck, lint, test, build pass; `admin/index.ts` is `export {}` | **REAL** |
| C1 | Signatures for 7 calls, fixtures, stubs return fixtures | `src/modules/*/{index,fixtures}.ts` | `contracts.test.ts` 10 tests pass | contracts **REAL**, bodies **STUB** (deviations in section 4) |
| C2 | `quoteHash` in `Quote`; `acquireHold` recomputes in the transaction; `PRICE_CHANGED` + new quote; booking stores snapshot; payment charges `total_paise` | `pricing/hash.ts`, `types.ts`, `booking/index.ts`, `schema/booking.ts` | `hash.test.ts` (4); stub `PRICE_CHANGED`/`AMOUNT_MISMATCH` tests; `bookings.quote_hash` and `booking_nights` exist | hash **REAL**; recompute, snapshot write and charge **STUB / NOT BUILT** |
| F2 | Drizzle schema per `03`, migrations run on Neon, all CHECKs and indexes | `src/db/schema/*`, `migrations/0000_*.sql` | live DB: 19 tables, 23 CHECKs, 6 indexes, 1 migration row; `schema.test.ts` (4) per `06-progress.md` | **REAL** |
| F3 | 64 + 12 keys (76), photos, 180 days of rates and inventory, slabs, promos, users, 30 bookings, 30 labelled enquiries | `src/db/seed/*` | DB counts: 4 types, 12 photos, 2160 rates, 720 inventory, 2 slabs, 3 promos, 5 users, 30 bookings, 30 enquiries; `seed.test.ts` (5) and `pricing.test.ts` (5, I saw these pass) | **REAL** |
| F4 | Auth.js credentials, bcrypt, `requireRole()`, `requireGuestOwner()`, staff login, guest sign up and login | `src/lib/auth/*`, auth pages, `proxy.ts` | `verifyCredentials` integration (4), guards (3) and safe-next (2) tests; sign-up, sessions and proxy are not tested | credentials and guards **REAL**; sign-up, session, proxy, UI flow **REAL-UNTESTED** |
| F5 | GitHub Action: typecheck, lint, unit, Postgres integration | `.github/workflows/ci.yml` | file reviewed; never executed on GitHub | **REAL-UNTESTED** |
| F6 | Vercel + Neon deploy | n/a | `06-progress.md`: todo | **NOT BUILT** (out of scope for S0 as agreed) |
| F7 | Tokens, guest and staff shells, Button, Input, Card, Skeleton, EmptyState, ErrorState, Toast | `src/components/*`, `globals.css`, `/dev/ui` | build prerenders `/dev/ui` pages; `docs/screenshots/F7.png` (229 KB) exists | **REAL-UNTESTED** |
| D1 | `docs/tdd-notes.md` started | `docs/tdd-notes.md` | 49 lines, 9 story entries | **REAL** |
| S0 goal | "deployed app where every module returns fixtures" | n/a | modules return fixtures; nothing is deployed | partial (no deploy) |
| Definition of Done | loading, empty, error states; tests; docs updated; screenshot | various | skeleton/empty/error components exist but only `/dev/ui` shows them; `06` and `tdd-notes` updated | partial |

## 10. Risks and gaps, and what S1/S2 builds on

### Risks and gaps (highest first)
1. **The integration suite is destructive.** `seed.test.ts` TRUNCATEs and re-seeds. `TEST_DATABASE_URL` falls back to the dev DB, and `DB_PROTECTED_HOSTS` is empty by default. When production credentials exist (F6), a wrong `.env.local` could wipe data. Set `DB_PROTECTED_HOSTS` and a dedicated `TEST_DATABASE_URL` before F6.
2. **Nothing concurrent is tested.** The booking core's required tests (20 parallel holds, rollback of a partly sold stay, double expiry, duplicate payment, late payment) do not exist yet. The DB `inventory_capacity_check` is the only real safety net so far, and it is proven.
3. **Price logic exists in two places.** `seed/pricing.ts` and the future `modules/pricing` must agree, and the seeded bookings' `total_paise` and `quote_hash` come from the seed version. Slab boundary (inclusive at ₹7,500) and the GST rates (5% and 18%) are assumptions (A2), flagged for the scrum master.
4. **Two contract deviations need sign-off** before S1 relies on them: `acquireHold` input shape, and `REFUND_PENDING` as an ok outcome (`06` open question 5).
5. **CI never ran.** `format:check` and the pnpm pin are unverified remotely.
6. **Auth is thinly tested and thinly enforced.** The sign-up action, `proxy` and role-gated layouts have no tests. The proxy accepts any cookie with the right name. There is no rate limiting or security headers (H2). Every future action must call the guard itself; no lint rule enforces it.
7. **`/dev/ui` is public**, only `noindex`. Remove or gate it before go-live.
8. **Type mismatches waiting to bite:** `confidence` string vs number, fixture string ids vs UUIDs, no `ENQ-` id generator.
9. **No FK indexes** (for example `payments.booking_id`, `booking_events.booking_id`, `booking_nights` has its PK). Fine at 30 bookings; revisit at scale.
10. **Fixed 10-minute hold in seed** while `HOLD_MINUTES` is an env var. B3 must read the env var.
11. `next-auth` is a beta (`5.0.0-beta.32`) and Next 16 `cacheComponents` is new. Both are documented decisions, but they raise upgrade risk.
12. No mobile (375px) audit; no performance or accessibility pass (H3, H4, H5).

### What S1 and S2 build on

| Component | Exists now | S1/S2 story | What the next developer must do |
|---|---|---|---|
| `pricing` contract + `computeQuoteHash` | real hash, stub `quote()` | B1 | Implement `quote()` from `daily_rates`, `tax_slabs` and `promo_codes`; return `NO_RATE`, `PROMO_INVALID`, `OVER_OCCUPANCY`; make it agree with the seed; the hash must match what the seed wrote |
| `inventory` contract | stub; table and CHECKs real | B2, A2 | Lazy expiry, then availability from `inventory` less blackouts. Allotment edits via `WHERE sold + held <= new` |
| `booking` contract | stub; `bookings`, `booking_nights`, `booking_events` tables real | B3, B4, B5 | Ordered `FOR UPDATE`, hash recompute, snapshot insert, retry once, expiry release with `SKIP LOCKED`, conditional-update state machine, then the 9 required tests |
| `payments` | interface only | B7, B5 | MockProvider and `/api/payments/mock` webhook calling `confirmPayment` |
| Schema + seed | complete, live on dev branch | all | The base for every story. Re-seed any time with `pnpm db:reset && pnpm db:seed` (dev only) |
| Fixtures + UI kit | components and `/dev/ui` | G1 to G3, B6, A1, A2, Q4 to Q6 | Build screens against fixtures, then swap each to the real module. Keep fixture ids out of components |
| Auth guards | `requireRole`, `requireGuestOwner`, layouts | every action | Call a guard first in each server action and route handler; add tests when the first one is written |
| `enquiries` and `ai-router` contracts | stubs; tables real; 30 labelled rows | Q1 to Q7, R1 to R5 | Generate `ENQ-` ids, persist `pending` before AI, `after()` plus sweep; labelled rows feed `pnpm eval:ai` |
| `catalog` | stub with 4 rooms | G1 to G3 | Back it with `room_types`, `room_photos` and `rate_plans` |
| CI | workflow file | all | First push will show whether it works. Keep `main` green |
| Locks table | S0 owns both areas | S1 | Scrum master reassigns before S1 touches `src/db/**` or the booking modules |
