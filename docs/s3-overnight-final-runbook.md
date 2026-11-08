# S3 overnight runbook: finish, harden, verify, prepare submission

Owner: **Claude Code (Opus), unattended overnight.** Scrum master is asleep. Approved 2026-11-09 04:50 IST. Deadline: 9 Nov 2026 23:59 IST.
Goal: by morning, `main` holds every feature, is hardened and fully verified, and the submission material is ready. Each phase is small, ends green and is merged, so `main` is always deployable.

## Merge authority (this run only)
You may merge a phase branch into `main` yourself with `git merge --no-ff` and push, **only when all of these hold**: typecheck, lint, format:check, unit tests, build pass on the merged result; the phase's integration files pass; a fresh review subagent (no context: this runbook, the relevant docs, the diff) reports **no blockers and no majors**, or every one it reported is fixed and rechecked. Otherwise leave the branch pushed, record why in the handoff, and move to the next phase. Never force push, never rewrite history, never touch the Neon production branch or any production credential.

## Standing rules
1. One branch per phase from the latest `main`: `claude/s3-<phase>`. Small commits, push after each.
2. Keep `docs/s3-overnight-handoff.md` updated after every commit: phase, last done, next, gates, open items. A new session resumes from it and `git log`.
3. **Memory:** the PC ran out of memory on a full PostgreSQL run. Always run integration with `--no-file-parallelism`, stop any dev server before integration, and never run two heavy jobs at once.
4. `TEST_DATABASE_URL` is `test-claude`. Check the guard and that no other process uses it before each integration run. Dev DB reseed only through the guarded scripts.
5. Respect every earlier decision in `06-progress.md` and the runbooks: roles in `permissions.ts`, prices only from `pricing`, drafts never auto sent, complaints always reach GM, no schema change unless a phase says so.
6. Blocked on an item for more than about 30 minutes: log it, move on.
7. Before Phase 2, check `git ls-remote origin` for a `codex/polish` branch. If it exists, Codex is doing polish: skip Phase 2 items that branch covers and do not edit those files.

## Phase 0: Groq provider with key failover (`claude/s3-groq`)
Skip if `origin/main` already contains it (check for `groq` in `src/modules/ai-router/provider.ts`). If a `claude/s3-groq` branch exists unmerged, finish it.
1. Add `groq` to `AI_PROVIDER` via `@ai-sdk/groq`; model id from `AI_MODEL` (document a default in `.env.example`).
2. Read `GROQ_API_KEY_1` to `GROQ_API_KEY_4`, skip empty ones, use in order. On 429, quota or 401/403: cool that key down (retry-after, else 60 s, in memory) and try the next immediately. All failing: rules fallback exactly as today (unsorted). Timeouts and 5xx keep the 10 s timeout and one retry; total time stays bounded.
3. Never log, store or return key values or the failing key index; log only "groq key rotated" with a count. PII redaction and Zod unchanged.
4. Names in `.env.example` (empty). Do not overwrite `.env.local` values the scrum master pasted; only add missing empty placeholders. Never print `.env.local`.
5. Docs: `04` provider table and failover rule, `02` env table, `06` decision.
6. Unit tests with the provider mocked: key 1 429 then key 2 used; all four fail gives rules fallback and unsorted; empty keys skipped; no key value in any error or log.
7. Merge per rule. Phase 3 uses `AI_PROVIDER=groq` if at least one key is set in `.env.local`.

## Phase 1: finish the inbox (`claude/inbox`, already pushed)
1. On `test-claude` only, delete leftover fixture rows from the killed run (users `inbox-*@test.example`, enquiries `ENQ-T*`, and their child rows).
2. Wire the `/admin` overview counts per role from the inbox queries (approved; read only), replacing "Coming with the inbox". Test it.
3. Integration, one file at a time: `inbox.test.ts`, enquiries and ai-router files, the review-fix test. Fix failures.
4. Review subagent on `git diff main...claude/inbox` against `docs/s2-inbox-runbook.md` and `04`: permission on every entry point, visibility in SQL, never auto send, complaint always to GM, prices only from quote.
5. Merge per the merge authority rule.

## Phase 2: polish and security (`claude/s3-polish`)
1. **Auth forms keep input on failed validation** (React 19 resets uncontrolled fields after a form action): guest login, sign up, staff login, `/dev/login`, inline sign up and details on `/book/details`, and `/enquire`. Return non secret values plus an `attempt` key; `defaultValue` and `key={attempt}`; passwords never returned; field errors with `aria-invalid`; login says "Email or password is incorrect"; keep `next`. Unit tests.
2. **Favicon** via `src/app/icon.svg` (brand initial, accent on paper). Console clean on `/`, `/login`, `/admin/login`.
3. **H2:** security headers in `next.config.ts` (CSP that works with next/font and next/image, nosniff, Referrer-Policy, frame DENY, Permissions-Policy, HSTS), verified with `pnpm build && pnpm start` and no CSP errors on every page. Rate limiting (in memory sliding window per IP and email, documented as per instance) on guest login, sign up, staff login, `/enquire`, the hold action and the pay action. Grep repo and history for secrets; report only.
4. Copy `../resort-review2/docs/resort-review-booking-flow.md` into `docs/reviews/` if it is not there.
5. Merge per rule.

## Phase 3: AI quality evaluation, R5 (`claude/s3-eval`)
1. `pnpm eval:ai` (create it if missing, inside `scripts/`, using the existing ai-router services) over the 30 labelled seed enquiries. Run with the `rules` provider and with Groq (the provider configured in `.env.local`) (synthetic data only; respect free tier rate limits with a delay; never send contact details).
2. Report per category accuracy, unsorted rate, complaint recall (every complaint must notify GM), draft template fallback rate, grounding outcomes. Save `docs/eval/r5-results.md` and the raw JSON.
3. If complaint recall is below 100 percent, fix the routing keyword rules (not the model) and rerun. No other AI changes.
4. Merge per rule.

## Phase 4: performance, H3 (`claude/s3-perf`)
1. `pnpm build && pnpm start`. Lighthouse (npm `lighthouse`, mobile, Slow 4G throttling) on `/`, `/rooms` with a search, a room page, `/book/details` (signed in), `/enquire`. Record LCP, total JS per page against the `02` budget (30 KB per page above the about 120 KB baseline, LCP under 2.5 s).
2. Fix what is in reach: image sizes and `priority`, `sizes` attributes, lazy below the fold, client components that pull server or heavy code, font loading. Do not weaken locking or correctness for speed.
3. Save `docs/perf/h3-results.md` with before and after numbers. Note that local DB latency to Neon dominates server time and that deploy region matching is the real fix.
4. Merge per rule.

## Phase 5: states, mobile, accessibility, H4 and H5 (`claude/s3-ux`)
1. Walk every screen in real Chrome at 1280px and 375px, signed out, as a guest, and as reservations, sales and GM: home, rooms, room detail, details, pay, confirmation, My bookings, enquire, staff login, overview, rates, allotment, promos, bookings, inbox, enquiry detail, outbox.
2. For each: loading, empty and error states present; no dead buttons or links; no horizontal scroll at 375px; no console errors (chase the one off hydration warning); keyboard usable booking flow; visible focus ring; labels on inputs; AA contrast; copy voice per `05`.
3. Fix everything small. Record anything larger.
4. Save a screenshot set for the TDD in `docs/screenshots/final/` (one per key screen, desktop and 375px, consistent naming) and an index `docs/screenshots/final/README.md`.
5. Merge per rule.

## Phase 6: full end to end verification (`claude/s3-verify`, docs only unless a bug is found)
1. Reseed the dev DB. Full integration suite on `test-claude`, one file at a time. Full unit. Build.
2. Playwright: guest books and pays; staff approves a draft. Both against `pnpm dev`.
3. Scripted acceptance walk of the brief's core slice: search, room pages with availability and price incl. GST, 3 step booking, test payment, confirmation, rate and allotment admin, blackout (offline) and promo admin, enquiry from web form, simulated email and WhatsApp, AI classify, extract, route, draft with a server quote, low confidence to unsorted, one click re route, approve and send, complaint alerts GM, roles enforced.
4. The three brief enquiries (ENQ-4410, 4411, 4412) produce the expected categories and owners.
5. Any bug found: fix on this branch with a test, then merge per rule. Write `docs/final-check.md`: every check, result, evidence.

## Phase 7: deployment preparation (`claude/s3-deploy-prep`)
Do not deploy (needs the scrum master's Vercel login).
1. `vercel.json`: pin the function region to the Neon project's region (read the region from the host name; record it), keep the cron.
2. A guarded `pnpm db:deploy` script for production migration and demo seed that refuses to run unless `ALLOW_PRODUCTION_SEED=yes` is set and prints the target host fragment first. Document it; never run it.
3. `README.md`: what it is, stack, run locally step by step, tests, demo logins for guest, reservations, sales, GM, dev tools flag.
4. `deployment.md` (repo root): run locally step by step, how it is deployed (Vercel + Neon, region match, cron, migrations, seed), every environment variable by **name only** with purpose, demo login details, mock payment and webhook notes, known limits.
5. Merge per rule.

## Phase 8: TDD material pack (`claude/s3-tdd-pack`, docs only)
Write `docs/tdd-material.md`, the raw material the scrum master turns into the TDD. No prose polish needed; facts, numbers, links:
1. GitHub URL; live URL placeholder.
2. Architecture: modules, request flow, transaction ownership, lock order, AI pipeline (short, with a mermaid diagram).
3. Data model: tables and the key constraints.
4. Main flows: booking (with the state machine), enquiry to reply, admin edits.
5. AI part: provider, schema, grounding, routing rules, draft guard, what happens when wrong or unsure, R5 numbers.
6. UI decisions per key screen with the screenshot file names.
7. Every assumption labelled `[A]` from `00`, `06` and the runbooks, deduplicated.
8. Test evidence: unit, integration, Playwright counts; the nine mandatory booking tests; review history (each review, verdict, what was fixed).
9. What was cut, known limits, next steps (from every handoff's open items).
10. Merge per rule.

## Phase 9: wrap up
Reseed the dev DB for a clean demo. Final handoff: what merged (SHA per phase), what did not and why, test counts actually run, open items, and the exact morning steps (deploy commands and env names to set in Vercel).
