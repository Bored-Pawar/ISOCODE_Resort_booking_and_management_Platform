# Independent S0 review — Aditya Pawar

Reviewed 7 Nov 2026 (IST), `codex/dev`, HEAD `acebd3b`. Scope: source inspection against P0 acceptance criteria; no implementation changes.

## Executive summary

The skeleton is usable for further development, but the frozen booking composition needs approval before B1–B5 proceed.
There are **1 BLOCKER, 3 HIGH, 4 MEDIUM and 1 LOW** actionable findings below.
The separate test URL fix is present; reset still chains a migration against a different target in test mode.
Schema and migration match the documented foundation on inspection; live Neon state was not independently verified.
Auth verifies sessions server-side; `connection()` precedes verification and does not replace it.
Primary button contrast is corrected in source; browser behavior and mobile layouts remain unverified.
The reported 44 unit / 13 integration passes are not independently reproduced in this worktree.
S1 UI/intake work can start; booking work needs the contract decisions below. F6 is not cleared yet.

## Verification and limits

| Check | Independent result |
|---|---|
| Branch / initial changes | `codex/dev`; initially clean. No pull, push, merge, rebase or branch changes. |
| `pnpm typecheck`, `lint`, `format:check`, `test` | All attempted; none reached a usable checker. pnpm's automatic dependency verification hit `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK` / access denied; `tsc`, `eslint`, `prettier`, `vitest` were unavailable. Environment failure, not evidence of source failure. |
| Build | Not attempted after dependency failures; no independent build result. |
| Integration / DB scripts | Not run, as instructed. No DB connections, credentials used or Neon writes. |
| Test inventory | Source contains 44 unit cases (including 11 safety and 2 token cases) and 13 integration cases. Counts do not establish passing behavior. |
| Secrets | Only `.env.example` is tracked among env files. Inspected config uses CI-only placeholder credentials; seed demo password is intentionally public. No history-wide secret audit. |

## Findings

“Confirmed” means established from the source, with a concrete path or counterexample; runtime reproduction was unavailable. “Risk” identifies an exposure whose occurrence is unverified. BLOCKER applies to compliant booking implementation, not every S1 story.

| ID | Severity / kind | File and line | Evidence | Why it matters | Recommended fix | Story | Deadline |
|---|---|---|---|---|---|---|---|
| R01 | BLOCKER — confirmed contract gap | `src/modules/pricing/index.ts:13`; `src/modules/inventory/index.ts:40`; `src/modules/booking/index.ts:89`; `src/lib/db.ts:6` | `quote(input)` has no `tx`; inventory exports only availability; booking has no expiry-release API. A `Tx` type exists, but no public transaction composition path. | B3 must reprice inside its transaction; B2 must trigger booking expiry. Frozen APIs plus the ban on cross-module table access prevent the specified implementation without an approved extension. | Approve optional `tx` or a transaction-scoped pricing service and minimal inventory mutation / expiry contracts through `index.ts`. Specify ownership and lock order before implementation. Do not silently bypass module boundaries. | C1/C2, B1–B5 | before S1 |
| R02 | HIGH — confirmed contract gap | `src/modules/booking/index.ts:51`; `src/modules/pricing/types.ts:51` | Quote can return `PROMO_INVALID` and `OVER_OCCUPANCY`; hold's error union cannot. Stay input carries promo and occupancy. | A promo can expire or reach its limit between display and hold; B3 needs a typed business failure rather than a throw or a misleading `SOLD_OUT`. | Approve adding these hold failures or explicitly approve their mapping to existing errors; test invalidated promo and over-capacity stays. | C2, B1/B3/B6 | before S1 |
| R03 | HIGH — confirmed target bug | `package.json:19`; `src/db/reset.mts:5`; `src/db/migrate.mts:4` | With `DB_TARGET=test`, reset drops `TEST_DATABASE_URL`; the chained `db:migrate` ignores that flag and uses `DATABASE_URL_UNPOOLED` or `DATABASE_URL`. With only the test URL it fails after the drop. | One reset command can write to two DBs and leave the test DB empty. Migration also falls back to the application URL without target confirmation. Current integration helpers migrate their own test connection, so this is not a claim that CI currently invokes reset. | Resolve the target once for the whole reset/migrate operation; remove implicit fallback and require an explicit, independently checked deployment migration target. Add target-routing tests without DB writes. | F2/F5/F6 | before F6 |
| R04 | HIGH — confirmed guard limitation / deployment risk | `src/db/safety.ts:29`; `src/db/safety.ts:36`; `src/db/seed/index.ts:47` | A supplied production URL passes in dev mode if `NODE_ENV` is absent and `DB_PROTECTED_HOSTS` empty. Test-only env also passes any host if app URLs are absent. Target hosts are pooler-normalized; protected fragments are not. Seed truncates all tables. | Protection is conditional on external configuration, not proof of a disposable target. A production URL pasted into a local terminal can still be wiped. No evidence that this has occurred. | Use an explicit disposable-target allowlist/identity for destructive commands; normalize both protected and target hosts. Before F6 establish production protection in local/operator environments, not only Vercel. Keep production credentials out of tests. | F3/F5/F6, H2 | before F6 |
| R05 | MEDIUM — confirmed fixture defect | `src/modules/pricing/index.ts:19`; `src/modules/booking/index.ts:97`; `tests/unit/contracts.test.ts:44` | Changing quote dates/room/plan replaces only headers; nightly dates, totals and hash stay from the original fixture. Hold echoes only guest ID, ignoring the requested stay. Tests use the original stay and assert only success. | G1–G3/B6 built on these stubs can display contradictory stays and a hash that does not describe the returned quote. This is fixture coherence, not a demand for real B1/B3 logic in S0. | Return coherent fixtures for supported scenarios or explicitly reject unsupported ones; assert `computeQuoteHash(result.quote)`, night coverage and hold stay equality with alternate inputs. | C1/C2, G1–G3/B6 | before S1 |
| R06 | MEDIUM — confirmed UI failure path | `src/components/ui/data-grid.tsx:76`; `src/components/ui/data-grid.tsx:138` | Commit awaits an async callback, but blur cancels editing while pending; a later rejection message no longer has its editor. A thrown callback escapes `void commit()` with no error state. | Rates/allotment changes over a slow network lose rejection recovery; interacting with another cell can also be affected by completion of the old commit. | Keep the pending cell stable, catch failures into an error state, and prevent stale completion from closing another cell. Test deferred success, rejection and thrown error. | F7, A1/A2 | during S1-S3 |
| R07 | MEDIUM — confirmed callback bug | `src/components/ui/hold-timer.tsx:29` | Effect depends on `onExpire` and resets `fired` every run. After expiry, a parent rerender supplying a new inline callback fires expiry again for the same timestamp. | B6 expiry handlers that update parent state or acquire a fresh hold can repeat side effects. | Track expiry firing by target timestamp; keep callback identity changes from resetting the once-only guard. Test rerenders after zero. | F7/B6 | during S1-S3 |
| R08 | MEDIUM — confirmed validation gap | `src/modules/ai-router/index.ts:12` | Classification accepts `from: "garbage"`, reversed ranges, negative guest counts and negative budgets. Only confidence/category have meaningful domain bounds. | R3's Zod gate can accept unusable extracted values; R4 cannot safely pass them into pricing or draft templates. No real provider is wired yet. | Refine optional dates and ranges, positive/nonnegative counts and budgets; route rejected model output through fallback. Keep vague dates in `dates.text`. | C1, R3/R4 | during S1-S3 |
| R09 | LOW — confirmed latent helper defect | `src/db/seed/pricing.ts:31` | Flat discount example: rates `[100,1000]`, value `600` returns `[100,300]`: only 400 discounted although the subtotal covers 600. Clipping each equal share loses unused discount. | The helper promises an exact total; copying it into B1 would under-discount uneven stays. Current seeded promo/rates do not exercise this clipping case. | Allocate the capped flat total across remaining nightly capacity and test uneven/fully discounted stays; do not reuse this helper unchanged in B1. | F3/B1 | post-submission |

## S0 acceptance criteria

PASS below means source-level AC is present; it does not assert an executable or live-DB verification.

| Story | Status | Evidence / remaining acceptance |
|---|---|---|
| F1 | PASS | Strict TS, Next, Tailwind/shadcn configuration, lint/format/Vitest scripts and module entry points present. Executable checks unavailable here. |
| F2 | PARTIAL | All 19 documented tables, 23 CHECKs and 6 named indexes appear consistently in schema and SQL migration. Neon application claim unverified; R03 target safety remains. |
| F3 | PARTIAL | Seed builds 76 keys, 12 photo rows, 180-day rates/inventory, users, slabs/promos, 30 bookings and 30 labelled enquiries. Runtime counts/idempotency unverified; destructive safety has R04 limitations. |
| F4 | PARTIAL | Separate credential providers, bcrypt, JWT callbacks, role/owner guards, login/signup and consent persistence present. Actual session/signup/browser flows unverified. |
| F5 | UNVERIFIED | Workflow runs static checks/unit/build plus isolated Postgres integration on PRs/main. No independent green Actions run or local suite result. |
| F6 | FAIL | Explicitly todo; no verified live deployment. Agreed deferral, not an unexpected S0 source defect. |
| F7 | PARTIAL | Required kit and shells present; accent foreground fix present. R06/R07 remain; no independent mobile/state audit. |
| C1 | PARTIAL | All seven named signatures, fixtures and stubs exist; transaction/error gaps and incoherent alternate-stay fixtures need attention (R01/R02/R05). |
| C2 | PARTIAL | Hash function and snapshot fields exist; composition gap R01 remains. Atomic recheck, persistence and real payment charging belong to B1/B3/B5, not completed S0 behavior. |
| D1 | PASS | `docs/tdd-notes.md` records foundation decisions, tradeoffs and recent fixes. |

## Top priorities and release decisions

1. **R01:** approve transaction composition and expiry/inventory interfaces before booking backend implementation.
2. **R02:** approve hold-error mapping plus the previously requested `{ stay, quoteHash, guestId }` input/full Booking output and `REFUND_PENDING` success outcome.
3. **R03:** make reset and migration use one explicit target before deployment tooling is used.
4. **R04:** establish disposable DB identity and production protections before F6 credentials become available.
5. **R05:** make alternate-stay fixtures coherent before guest screens rely on them.

**S1:** G1–G3 and Q1–Q3 can begin with their normal validation and ownership requirements; fix R05 for fixture-based integration. B1–B5 should wait for R01/R02 approval and scrum-master reassignment of locked areas. No source fixes or decision changes were made by this review.

**F6:** not yet cleared. Resolve R03/R04 and obtain a green clean-install CI/build plus dedicated-test-DB run by the authorized developer. Then a synthetic-data preview is reasonable; do not present the stub skeleton as a working booking application. Rate limiting/security headers remain H2 work before broad exposure. GST A2 still needs owner confirmation; this review makes no legal/tax-rate determination.

## Verified foundations, unverified risks and acceptable limitations

- **Hash coverage:** `pricing/hash.ts:17` uses deterministic ordered JSON of room/plan/stay/promo and nightly date/rate/discount/GST basis points, SHA-256 truncated to 128 bits. It matches `01`'s explicit notes. Excluding occupancy and derived totals is intentional. B1 must enforce integer arithmetic, deterministic night order and derived-total consistency; hash is a freshness token, not authorization or a signature.
- **Payment contract:** outcomes can represent confirmation, duplicate confirmation and refund pending; wrong amount has a typed error. Real idempotency is B5. Repeated late payments must return the existing refund outcome; CANCELLED stays CANCELLED per `01`, despite the abbreviated EXPIRED-only comment at `booking/index.ts:72`. UI must branch on `outcome`, not just `ok`.
- **DB integrity:** documented capacity/date/status/unique-payment constraints and indexes are present. Cross-room plan pairing, money arithmetic and HELD expiry are not database-enforced; B1/B3/B5 must validate them. These are documented app responsibilities, not schema drift. Additional payment/event FK indexes can wait for observed query needs; no scale blocker demonstrated.
- **Safety tests:** 11 cases exercise missing URLs, no fallback, protected fragments, pooler equivalence, production flag and child env routing. They do not exercise the chained reset/migrate path, production identity with absent flags, or pooled protected fragments. The current integration helper targets only the validated test URL; CI supplies only its disposable localhost test URL. Old handover fallback warnings are superseded.
- **CI risk, unverified:** Node 22, pnpm package-manager pin and frozen lockfile must work on a fresh Actions runner; no confirmed version incompatibility is established here. Integration files run serially, migrate through their own connection, and seed only the guarded test URL. Seed requires the tracked images and sharp. Do not equate the workflow's existence with a passing run.
- **Auth:** the proxy checks cookie presence only, intentionally. Server layouts subsequently call Auth.js and check roles; forged-cookie access is not an established bypass. `connection()` runs before auth under Suspense and adds no authorization exception. No protected business route/action exists yet; public auth entry points cannot require a prior guest role. Future actions must independently guard access and derive guest/actor IDs from verified sessions.
- **Auth testing gap:** guard tests mock `auth` and test pure assertions, not JWT verification or `requireRole()` integration. Signup, consent rejection, duplicate email, tampered/expired sessions and staff/guest page boundaries need executable tests during H1/H2; no confirmed session bypass was found. JWT role changes can remain stale for the configured eight-hour session; revocation policy is unverified, not an S0 AC failure.
- **Intentionally later:** real pricing/availability, atomic holds, expiry, payment provider/webhook, booking UI/confirmation, guest catalog pages, admin editors, persisted intake, provider adapters, AI recovery/drafts and outbox are B/G/A/Q/R stories. Their absence is not independently counted as an S0 defect. The nine booking concurrency/state tests belong with B1–B5.
- **Integration adapters:** Q1 needs unique enquiry IDs and conversion of DB numeric confidence to a number; inbox mapping must resolve owner IDs/roles and summary from extracted JSON. Fixture IDs differ from DB UUIDs; use returned IDs. These are planned implementation tasks, not reasons to redesign the schema now.
- **UI limits:** no browser, 375px, performance or full accessibility verification was performed. Token tests cover colors, not computed button styles. Public `/dev/ui` shows synthetic fixtures; gating/removal can be handled before final submission. Photos and shell placeholders are acceptable until their assigned guest/UI stories land.

Only this report and `s0-feature-map.md` are changed. The explicit two-file authorization takes precedence over the routine progress-log update rule.
