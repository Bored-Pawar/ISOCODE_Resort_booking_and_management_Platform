# TDD notes

One short entry per merged story: what, why, tradeoffs.

## S1 Codex B3 (local implementation; independent review pending)
- **What:** real atomic hold creation, frozen nightly snapshots and an audit event; `HOLD_MINUTES` expiry uses the database clock. Business-result exceptions roll back the entire transaction, including lazy expiry; PostgreSQL deadlock/serialization failures retry the entire transaction once, then return `SOLD_OUT`.
- **Identity and reads:** the guest server action validates only stay/hash from the browser and fills `guestId` from `requireRole('guest')`. The frozen `booking.get` service reads persisted snapshots and checks the verified actor's ownership; it never reprices a saved booking.
- **Lock order:** when scoped expiry releases a longer stay, lock the union of expired and requested nights in room/date order before any adjustment. Batch inventory updates only after ordered row locks; missing rows or database failures abort the whole transaction. Pricing-owned transaction helpers resolve promo identity/usage without cross-module table access.
- **Proof:** real PostgreSQL tests cover 20 simultaneous last-unit holds, overlapping stays, complete rollback (including an actual FK failure and a deliberately rejected audit insert), stale pricing, blackouts, allotment guards, occupancy/promo/rate revalidation and retry codes. Unit tests check verified-session identity and transaction configuration/error unwrapping.

## S1 Codex B4 (local implementation; independent review pending)
- **What:** the completed expiry helper changes each eligible HELD booking once with `FOR UPDATE SKIP LOCKED`, locks released inventory in room/date order, batches stock deltas and writes events in the same transaction. Availability remains room/date-scoped; payment expiry can target one booking; the public method is the full maintenance sweep.
- **Cron:** `GET /api/cron/expire-holds` validates its bearer header and empty query with Zod, compares hashed credentials with `timingSafeEqual` and fails closed if `CRON_SECRET` is absent or wrong. This machine route uses the explicitly required secret authentication instead of a user-session role. The existing environment variable is reused; the Vercel configuration requests a daily sweep at 00:00 UTC (05:30 IST), while lazy expiry remains primary. No deployment is performed.
- **Proof:** cron unit tests exercise missing configuration, bad/missing secrets, invalid input and authorised delegation. PostgreSQL lifecycle tests cover a locked expiry row, overlapping batch release, audit-failure rollback and competing acquisitions after a longer hold expires; the existing B2 scope/equality/double-release regressions remain.

## S1 Codex B5 (local implementation; independent review pending)
- **What:** payment validation uses only saved `total_paise`. The transaction first checks an existing provider ID, lazily expires only its target booking, and conditionally transitions HELD to CONFIRMED or settles an expiry crossed since that initial check. It writes the payment, stock movement, event and promo-use increment atomically. Existing terminal states are preserved; distinct extra charges are recorded for refund.
- **Idempotency:** `INSERT ... ON CONFLICT DO NOTHING` arbitrates the unique provider ID without treating unrelated constraint failures as duplicates. Same-booking/provider/amount retries return the saved success (`ALREADY_CONFIRMED`) or refund result; conflicting reuse returns `INVALID_INPUT` after rolling back any tentative transition. Late-payment retries create one refund obligation and audit note per provider ID.
- **Clock and lock order:** take the booking write lock before payment/stock locks. The conditional update uses one database decision clock; because its expression can be evaluated before waiting on a row lock, a post-lock database-clock check rejects a now-stale confirmation by rollback and one expiry retry. A separate internal clock-expression dependency enables exact SQL equality tests without a public clock parameter. PostgreSQL deadlock/serialization failures also get one transaction retry; exhausted infrastructure failures are thrown after rollback.
- **Proof:** all 28 new lifecycle PostgreSQL tests pass, including six parallel duplicate notifications, repeated late refunds while another hold owns the stock, both confirmation/expiry race orders, exact equality, a real five-second row-lock wait across expiry, cross-booking provider-ID reuse, distinct extra charges, terminal cancellation and audit-insert rollback. Every lifecycle test reconciles persisted stock. B7's gateway/webhook is not implemented; its future callback must verify the provider before invoking this service.
- **Final gate:** complete integration suite 60/60 across 6 files (744.98 s); all nine mandatory outcomes passed. Final UUID-case normalization for ownership and duplicate receipts was reverified in the 2 affected PostgreSQL tests (58.23 s). Typecheck/lint, all 74 unit tests (15 files) and production build pass. The existing CRLF checkout limitation remains for raw formatting; normalized formatting passes. The handoff is `docs/s1-b3-b5-handoff.md`; all B3–B5 commits remain local pending independent review and explicit integration approval.

## S1 Codex B1–B2 (reviewed and merged through PR #4)
- **What:** database-backed pricing and transaction repricing share one pure calculation with seed snapshots; nightly effective GST, promo validation, occupancy, deterministic hash and whole-paise rounding; capped flat discounts redistribute fully (R09).
- **Why:** the displayed quote and later hold recheck must use identical rules; frozen seed snapshots reconcile from their saved nightly rates, without comparing historical bookings to fresh rates.
- **Availability:** every night must have website stock; room/global blackouts include their end date and exclude checkout. `lockNights` holds ordered row locks without taking stock. Availability first calls the booking-owned expiry transaction.
- **Prerequisite moved forward:** B2 requires real lazy expiry, so the internal expiry helper, ordered inventory adjustment and public release wrapper are implemented ahead of the remaining B3/B4 work. Expiry uses `SKIP LOCKED`, releases each transitioned booking once, and writes audit events atomically; overlapping releases aggregate stock changes in room/date order.
- **Integration:** `/dev/ui` receives its quote fixture as a server prop, keeping the database dependency out of the browser. Public service signatures, fixtures and schema are unchanged. Claude's catalog must supply real database UUIDs before guest screens use the real services.
- **Scope at merge:** atomic acquisition/retries, cron authentication and exactly-once payment handling were left to B3–B5; the full nine-test booking gate was not claimed by that early PR. The continuation is recorded above.
- **Local proof:** typecheck, lint, 67 unit tests, 26 PostgreSQL integration tests and production build passed. Integration runs only after `assertSafeDestructiveTarget` and a read-only query verify the separate test endpoint; tests include seed snapshot/hash reconciliation, missing nightly stock, promo limits, both blackout scopes, lazy expiry and concurrent double release. Windows CRLF checkout causes the raw format check to fail; the whole-repository check with `--end-of-line auto` passes without unrelated file rewrites.
- **B1+B2 review fixes:** availability now uses booking's internal wrapper to expire only overlapping holds in the requested room type (or all room types for that date range); the public sweep remains site-wide for cron/maintenance. PostgreSQL regressions cover excluded rooms/dates, exact injected-clock equality, all-room results and unrelated corrupt inventory. Public signatures/schema stay frozen. GST complete-schedule semantics, import exceptions, minor fixes and remaining decisions are recorded in `01`, `02` and `06`; B3–B5 remain unstarted.
- **Review-fix proof:** after a fresh guarded preflight on the isolated test endpoint, typecheck, lint, 67 unit tests, 32 PostgreSQL integration tests and production build pass; whole-repository formatting passes with Windows line-ending normalization. The reviewed report is retained unchanged in `docs/resort-review-b1-b2.md`; feature history is preserved on `codex/dev`.


## S0 walking skeleton

### F1 Scaffold
- **What:** Next.js 16 (App Router, TypeScript strict), Tailwind 4, shadcn config, ESLint, Prettier, Vitest with separate `unit` and `integration` projects, pnpm. Folder layout exactly per `02-architecture.md`. `docker-compose.yml` with Postgres 16.
- **Why:** one consistent frame before parallel work starts.
- **Tradeoffs:** `cacheComponents` is on (the scaffold default for this Next version), so any page reading cookies, `searchParams` or the clock must sit inside `<Suspense>`. Kept: it gives partial prerendering, which helps the slow-network budget. shadcn's own runtime packages were dropped; the kit is hand built on the design tokens, keeping only the `cn`/`cva` pattern. No PNGs existed in `public/images`, so the image script is a no-op guard.

### C1 Frozen interfaces
- **What:** typed signatures, Zod input schemas and `fixtures.ts` for pricing, inventory, booking, enquiries, ai-router (plus a read-only `catalog` and a `PaymentProvider` interface). Stubs return fixtures.
- **Why:** UI and services build in parallel against the same contract.
- **Tradeoffs:** business errors are discriminated unions (`{ ok: false, code }`), never thrown, so every caller must handle each code. Cross-module fixtures are re-exported through each module's `index.ts` to respect the boundary rule.

### C2 Price contract
- **What:** `Quote.quoteHash` = SHA-256 (first 32 hex) over room type, plan, dates, promo and per-night rate, discount and GST basis points. `acquireHold` takes the hash the guest saw; mismatch returns `PRICE_CHANGED` with the new quote.
- **Why:** the displayed price, the held price and the charged price cannot silently diverge.
- **Tradeoffs:** occupancy is excluded from the hash (it does not change price). Clarifications are in `01-booking-core.md` (Contract notes).

### F2 Schema
- **What:** Drizzle schema and one migration for all 19 tables, 23 CHECK constraints and the documented indexes. Integration tests prove the constraints reject bad rows (each case rolled back).
- **Why:** invariants such as `sold + held <= allotment` live in the database, not just in app code.
- **Tradeoffs:** Neon pooled endpoint needs `prepare: false`; migrations use the unpooled URL. Only the indexes listed in `03` were created; FK indexes (for example on `payments.booking_id`) may be worth adding if queries need them.

### F3 Seed
- **What:** idempotent seed (truncate then rebuild): 4 room types (A9), 12 photos with blur placeholders, 12 rate plans, 180 days of rates and inventory, GST slabs, 3 promos, 2 blackouts, 3 staff and 2 guests, 30 bookings across all states (one late payment as REFUND_PENDING), 30 labelled enquiries.
- **Why:** realistic data for every screen and for `pnpm eval:ai`.
- **Tradeoffs:** dates are relative to the seed day. Inventory sold and held are computed from the seeded bookings so the numbers always reconcile (verified by a test). Enquiry ground-truth labels live in `enquiries.data.ts`, not in the database. GST slabs (5% up to 7,500, 18% above) must be verified before go-live.

### F4 Auth
- **What:** Auth.js v5 credentials with two providers (guest, staff) so the logins stay separate, bcrypt, JWT sessions, `requireRole()` and `requireGuestOwner()`, guest sign up with DPDP consent, `proxy.ts` redirects.
- **Why:** role checks run inside actions and handlers; the proxy only redirects.
- **Tradeoffs:** `proxy.ts` checks only for a session cookie, real authorization is in layouts and guards. Unknown-email logins still run a bcrypt compare to flatten timing. Rate limiting is deferred to H2.

### F5 CI
- **What:** GitHub Actions: typecheck, lint, format check, unit tests and build; a second job runs integration tests against a Postgres 16 service container.
- **Why:** every PR proves the schema and booking logic against a real database.
- **Tradeoffs:** not yet run on GitHub (no push from this session); steps were mirrored locally.

### F7 UI kit
- **What:** tokens as CSS variables mapped into Tailwind, Fraunces via `next/font`, guest, staff and auth shells, and the components in `05` with loading, empty and error variants. Hidden review page at `/dev/ui` (noindex, not linked).
- **Why:** screens in S1 compose from one kit and one set of states.
- **Tradeoffs:** the date range uses native date inputs (best on mobile, no JS dependency). DataGrid is hand built (sticky header and first column, inline edit with rejection messages). Screenshot at `docs/screenshots/F7.png`.

### D1
- This file.

## S0 fixes

### Database safety
- **What:** one pure guard, `assertSafeDestructiveTarget(env)`, used by seed, reset and the integration helpers. Integration tests require `TEST_DATABASE_URL`; the seed child process is started with `DB_TARGET=test` so it cannot aim at `DATABASE_URL*`.
- **Why:** the old suite fell back to the development database and the seed truncates every table. Fail closed beats trusting the developer's env.
- **Tradeoffs:** host comparison treats Neon's pooled and direct endpoints of a branch as equal. `DB_PROTECTED_HOSTS` is still opt-in, so production must set it. `migrate` is unchanged (not destructive).

### Request-time auth rendering
- **What:** `await connection()` before `auth()` in the account page and staff layout gate.
- **Why:** Auth.js calls `crypto.getRandomValues()`; with `cacheComponents` that is an error during prerender. Session and role checks stay on the server inside `<Suspense>`.

### Button contrast
- **What:** `--accent-foreground` token; primary button uses it. Loading no longer applies the disabled opacity. A unit test computes the contrast from `globals.css`.
- **Tradeoffs:** a genuinely disabled primary button keeps 50% opacity (WCAG exempts inactive controls).

## Codex review follow-up

### Transaction composition (R01)
- **What:** `booking` owns the transaction and calls internal `pricing.quoteInTx`, `inventory.lockNights`, `inventory.adjustNights` and its own `releaseExpiredHoldsInTx`. Lock order and rollback rules are in `01-booking-core.md`.
- **Why:** the hold must reprice and take stock in one transaction, but modules may not touch each other's tables.
- **Tradeoffs:** one sanctioned exception to "only through `index.ts`" (`internal.ts`, booking only). Stubs throw until B1 to B4.

### Coherent stubs (R05) and hold errors (R02)
- **What:** stub `pricing.quote` builds nights from the requested dates with a fixed rate per room; the stub hold reprices and compares the hash. The hold result now includes `PROMO_INVALID` and `OVER_OCCUPANCY`.
- **Why:** screens built on fixtures must show one consistent stay, price and hash.

### Button text colour, real root cause
- **What:** `cn()` now uses `extendTailwindMerge` with the custom type scale (`text-body`, `text-small`, ...).
- **Why:** `tailwind-merge` did not know those sizes, read them as text colours, and silently removed `text-accent-foreground` from every primary button (and any `cn()` call mixing a colour with a custom size). The earlier token fix was correct but was stripped before render.
- **Guard:** `src/lib/utils.test.ts` checks the merge, that every `--text-*` size in `globals.css` is registered, and that primary button classes keep white text at both sizes.
