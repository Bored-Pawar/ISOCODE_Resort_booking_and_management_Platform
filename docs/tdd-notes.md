# TDD notes

One short entry per merged story: what, why, tradeoffs.

## S1 Codex B1–B2 (implemented; awaiting independent review)
- **What:** database-backed pricing and transaction repricing share one pure calculation with seed snapshots; nightly effective GST, promo validation, occupancy, deterministic hash and whole-paise rounding; capped flat discounts redistribute fully (R09).
- **Why:** the displayed quote and later hold recheck must use identical rules; frozen seed snapshots reconcile from their saved nightly rates, without comparing historical bookings to fresh rates.
- **Availability:** every night must have website stock; room/global blackouts include their end date and exclude checkout. `lockNights` holds ordered row locks without taking stock. Availability first calls the booking-owned expiry transaction.
- **Prerequisite moved forward:** B2 requires real lazy expiry, so the internal expiry helper, ordered inventory adjustment and public release wrapper are implemented ahead of the remaining B3/B4 work. Expiry uses `SKIP LOCKED`, releases each transitioned booking once, and writes audit events atomically; overlapping releases aggregate stock changes in room/date order.
- **Integration:** `/dev/ui` receives its quote fixture as a server prop, keeping the database dependency out of the browser. Public service signatures, fixtures and schema are unchanged. Claude's catalog must supply real database UUIDs before guest screens use the real services.
- **Remaining:** atomic acquisition/retries, cron authentication and exactly-once payment handling remain B3–B5; the full nine-test booking gate is not claimed by this early PR.
- **Local proof:** typecheck, lint, 67 unit tests, 26 PostgreSQL integration tests and production build passed. Integration runs only after `assertSafeDestructiveTarget` and a read-only query verify the separate test endpoint; tests include seed snapshot/hash reconciliation, missing nightly stock, promo limits, both blackout scopes, lazy expiry and concurrent double release. Windows CRLF checkout causes the raw format check to fail; the whole-repository check with `--end-of-line auto` passes without unrelated file rewrites.


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
