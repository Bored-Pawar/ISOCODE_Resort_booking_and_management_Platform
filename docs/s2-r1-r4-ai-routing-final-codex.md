# S2 R1–R4 — FINAL CODEX EXECUTION HANDOFF

**Approved with fixes:** 2026-11-08. This replaces the previous draft `s2-r1-r4-ai-routing-codex-handoff.md` for implementation purposes. Claude's pasted “APPROVE WITH FIXES” is the completed **plan review**; there is **no second plan review**, review-report paperwork, or waiting period. One independent Claude Opus **code review** remains before merge. **This document is an instruction, not evidence that code was run or merged.**

## 0. Start immediately, safely

1. **M0 (~short preflight):** inspect latest actual `main` and Claude multi-room branch/PR status; fetch with permission; identify reviewed B10 integration commit and note SHA. **Use the latest approved merged `main`** as implementation base. If it is not merged, inspect the approved integration base and coordinate ownership instead of guessing or changing main. Work in `codex/r1-r4-ai-routing`, separate clean worktree. No unreviewed merge, push, reset or deployment.
2. Inspect `CLAUDE.md`, `AGENTS.md`, existing `src/modules/{enquiries,ai-router,pricing,catalog,inventory}`, ingestion routes, DB schema, test setup, `docs/{02-architecture,03-data-model,04-ai-router,06-progress,07-backlog}.md`. Preserve **public** `aiRouter.process` and `enquiries` contracts unless separately approved.
3. Confirm code path locks: Codex owns `ai-provider`, `ai-router`, and R2 enquiry internals. Claude may build Q4–Q7 pages against frozen interfaces and seeded data, but must coordinate edits to enquiry internals/shared routes. Booking, pricing, inventory, catalog, DB schema, and guest form UI are read-only here.
4. Run typecheck/lint/unit/build baseline. Before any integration test or seed, independently verify isolated `TEST_DATABASE_URL` using repository safety guards. Never mutate production or an unverified DB. No migration intended.
5. Implement **M1 → M2 → M3 → M4 → M5** in logical commits; report executed tests and provider results accurately. One independent code review, correct blockers/majors, PR/green CI and explicit merge authorization. Do not spend hours on separate review paperwork.

## 1. Frozen product/business rules

- One central `enquiries` table (no departmental duplication), with indexed `lane`, `owner_id`, `status`, `ai_status`; one row for web, simulated email or WhatsApp intake. Fast ingest persists `pending` and returns receipt before LLM work.
- Roles: **reservations** owns room enquiries; **sales** owns wedding/corporate offsites; **gm** owns complaints and sees unsorted; all three are staff roles (guest separate). Deterministic staff owner = **first active staff user of target role ordered `created_at ASC, id ASC`**. IMPORTANT: inspect actual `users` schema for an `active` flag; if none exists, use the documented available-account eligibility policy, do **not** silently add a column, and report precise interpretation. If none eligible, keep unsorted and GM-visible.
- Confidence `< 0.70` / rules fallback / model failure => unsorted. Category complaint **always** triggers GM alert even under fallback/low confidence. Unknown/other also unsorted. Rules classifier confidence <=0.5.
- **No automatically sent replies; staff review/approve later in Q6. No model-generated prices.** Do not send names, phone, email, or embedded contact PII to provider; model input is redacted guest message + nonidentifying form fields. Preserve webhook idempotency and consent metadata already in `extracted`.
- Unified Q2+Q9 form is **separate future UI work**; this PR consumes existing intake. Three-month online booking horizon is an approved product policy but **not implemented in this AI PR**; enquiries can be accepted beyond it. No staff booking, sales escalation UI, or Q4–Q7 screens here.

## 2. Architecture: one model call, small independent R1 module

```text
web/email/WhatsApp -> enquiries.ingest -> saved pending, fast receipt
                     -> after() processing + sweep-on-ingest/inbox-load
ai-router.process -> enquiries/internal claim(tx) -> ai-provider one structured call
                  -> validate classification and draftText
                  -> deterministic route + server quote + draft guard
                  -> enquiries/internal settle(tx): lock & generation check,
                     update row, notifications, draft, event atomically
                  -> ok / fallback / failed, never auto-send
```

### R1: `src/modules/ai-provider/` — provider transport only (2 points)

- Files (adjust minimally to existing SDK): `index.ts`, `factory.ts`, `execute.ts`, `types.ts` and focused tests. **One Vercel AI SDK structured-output code path** for Google, Anthropic, OpenAI-compatible local; no handwritten adapters per provider. Config `AI_PROVIDER=google|anthropic|local|rules`, `AI_MODEL` and documented env key names. Default for demo: Google Gemini Flash-family with a **specific model ID proven live in the project's API account**; avoid an assumed stale model ID. R1 has no role/category/enquiry/pricing/DB imports.
- Single call returns `{ category, confidence, dates, guests, budget, language, summary, draftText }` under Zod schema owned by `ai-router`, with `draftText` containing the literal `{{QUOTE}}` placeholder where relevant. No second drafting call. R1 accepts generic schema and prompt and returns typed result with provider/model/latency and sanitized error (`TIMEOUT`, `RATE_LIMIT`, `INVALID_RESPONSE`, `NOT_CONFIGURED`, `UNAVAILABLE`).
- 10-second per-attempt timeout, at most one retry for transient failures (honour 429 Retry-After when feasible but cap invocation budget). No retries for invalid keys/schemas. **Do not hold a DB transaction during LLM call.** Never log raw payloads, contact fields, keys or model output.
- `rules` factory returns `rules-only`, makes **zero network calls**. Rule classifier is owned by `ai-router` (not the transport layer), confidence <=0.5.
- Validate installed AI SDK version: some versions use `generateObject`, others favor `generateText({ output: Output.object(...) })`; use the locally installed supported structured-output method, not both and not speculative imports.

### R2: `src/modules/ai-router/processing.ts` + `src/modules/enquiries/internal.ts` (3 points)

- `enquiries/internal.ts`: **second explicitly approved internal cross-module exception**, analogous to booking R01. Only `ai-router` may import its transaction-aware `claim`/`settle` helpers. Booking owns none of these transactions. Document exception in `02-architecture.md`.
- State meanings **fixed**: `pending` awaits work; `processing` claimed; `ok` = model classified; `fallback` = rules classified; `failed` = nothing beyond raw row could be persisted. **A failed/unsafe draft must store a safe template without changing successful classification status.** On DB write failure the raw enquiry remains recoverable; never assert `ok` falsely.
- Atomic claims with row locks / conditional update, generation token based on persisted attempt counter (`ai_attempts`) and `ai_updated_at`; protect against simultaneous processes and stale workers. Do not use a long DB transaction across model calls. At settle: lock enquiry row `FOR UPDATE`, re-check claim generation, then update classification/owner/lane/status and insert drafts/notifications/events conditionally via `INSERT ... SELECT ... WHERE NOT EXISTS` in the same transaction. The row lock serializes settles; **no schema migration**. Never overwrite staff edits, approvals or reroutes on a late attempt.
- Existing `after()` on inbound triggers scheduling; add/keep **sweep-on-ingest and sweep-on-inbox-load**, batch **5**, covering `pending` and `processing` older than 2 minutes; secure a daily cron as optional backup, not primary recovery (Hobby cron frequency constraints). Set an appropriate `maxDuration` on *actual route handlers* scheduling `after()` per deployed Vercel limits. If only a server action schedules, inspect how `maxDuration` applies and document effective behavior rather than falsely exporting it there. A truncated invocation is recovered by sweep.
- Avoid reprocessing 30 already-classified seeded enquiries en masse. Constrain the sweep with status/time eligibility. Failed rows remain visible for manual retry in later Q4–Q7; don't add a public unsecured retry endpoint.

### R3: `src/modules/ai-router/{schema,prompts,pii,routing,fallback}.ts` (5 points)

- Zod: category `room|wedding|offsite|complaint|other`, numeric confidence [0,1], validated date strings/ranges, nonnegative guest counts and budget, useful language/summary, bounded draft length. Invalid provider output falls back to rules and `unsorted`.
- PII redaction: scrub name/email/phone/contact IDs from message and derived fields before sending to model. Explicitly avoid logging input; test embedded email/phone. Protect against prompt injection (model output is data, not actions).
- Routing **pure deterministic code**, never LLM-chosen owner: room -> reservations, wedding/offsite -> sales, complaint -> GM; low-confidence, fallback and `other` -> unsorted; complaint notification even if unsorted. Use stable owner selection D2. Preserve `extracted.source`, consent and pre-existing metadata by merge, not replacement; do not lose webhook dedupe keys.
- If model classifies complaint with low confidence still alert GM; if keyword rules detect complaint on provider failure, alert GM. For ambiguous messages that do not clearly indicate complaint, do not invent an alert classification; keep unsorted.

### R4: `src/modules/ai-router/{draft,quote-selection,price-guard,templates}.ts` (5 points)

- **One call** generates classification + `draftText` with `{{QUOTE}}`. Independently validate the draft. Detect AI-origin money tokens (`₹`, `Rs`, `INR`, currency words/amounts, unsupported discounts/percentages), while permitting legitimate dates/headcounts/IDs; guard checks **before** inserting trusted price. Unsafe or absent draft -> deterministic safe template, preserving model-classification `ok`.
- **Critical demo fix**: for `room` enquiries with valid date range and party, choose an available, occupancy-fitting **base-plan** room deterministically using public `catalog`, `inventory.availability` and `pricing.quote` (B10 `rooms: [...]` input). Interpret named category terms: e.g. “villa” restrict candidates to matching villa types; ENQ-4411 must be quoted for a villa, not cheapest plantation room. Among eligible candidates select smallest valid quoted total with stable tie-break. If split occupancy requires multiple rooms, attempt a deterministic affordable cart of <=4 lines only when safely supported; otherwise ask for details. Always check website availability, including each requested unit, and never promise a hold.
- Replace placeholder with something like **“From ₹X for your dates (including ₹Y GST), subject to availability.”** Clarify that this is an indicative live quote, not a booking or guaranteed allocation; quote may become unavailable. No eligible stock / invalid dates / absent party -> request clarification; no price. For wedding/offsite large groups, do not fabricate group rates; sales follows up.
- Persist one unapproved `reply_drafts` item with quote snapshot/provider/model/prompt version, `edited=false`, no `approved_by`/`sent_at`. On duplicate settle do not insert another draft; never overwrite human-edited/approved/sent content. No actual sending in R4.

## 3. Required module-level test gates

| Gate | Tests that must pass (fixtures/mock providers for repeatability) |
|---|---|
| **R1** | One structured call; google/anthropic/local selection; rules no network; missing key; timeout; 429; retries, unsupported schema and redacted diagnostics; architecture import boundary |
| **R2** | 2 concurrent claims -> 1 winner; claim generation increments once; stale worker cannot settle; `processing` exact two-minute boundary; batch limit 5; abrupt cut-off recovered; rollback on draft/alert DB failure; idempotent webhook/source merge |
| **R3** | ENQ-4410 wedding->sales, ENQ-4412 offsite->sales, ENQ-4411 room->reservations; 0.69 vs 0.70; complaint low-confidence/provider outage always one GM notification; unknown unsorted; wrong dates/negative guests; embedded PII never transmitted; deterministic first owner tie-break |
| **R4** | ENQ-4411 villa 14–16 Nov 2 adults 1 child gets **real price from pricing.quote**, correct GST, named villa filter; 2-room sample with B10; missing/oversold/no-rate gives no fabricated price; invented model ₹/Rs/INR offer rejected; classification remains `ok` when draft replaced by template; 1 persisted draft despite duplicate settle; never auto-sent |
| **All** | Real isolated PostgreSQL integration for claim/settle, intake to draft and event/notification; `pnpm typecheck`, lint, unit, build and guarded integration suite, no unrelated booking regressions |

## 4. API/model selection and initial evaluation (must run before claiming demo-ready)

- **API choice:** start with **Google Gemini Developer API via `@ai-sdk/google`** and the existing Vercel AI SDK. Use a currently available **Flash** model actually accessible on this project; exact `AI_MODEL` comes from a real credentialed smoke test and current Google AI Studio model/quota listing. The provider does not determine routing logic; it affects classification accuracy, structured-output reliability, latency and 429 frequency. Keep Anthropic as second provider option if available (never require a paid key for local tests), and deterministic `rules` as outage fallback.
- **Smoke gate (synthetic only):** a controlled dev script uses 3 seeded brief enquiries and 2 adversarial cases (complaint, ambiguous/mixed intent); verify structured schema parsing, returned `draftText`, category, PII redaction, latency and provider errors. No real contact info, no production writes. Start with **5 live calls** after API key/model check, not a burst of 30.
- **30-case accuracy gate:** `pnpm eval:ai` evaluates the 30 synthetic labelled inputs with about 4–5 seconds spacing initially; throttle according to actual quota and `Retry-After`. Report per-category precision/recall or confusion table, overall accuracy, low-confidence/unsorted percentage, schema validity, safe draft rate, median/p95 latency, and **429/timeouts excluded from the accuracy denominator but counted separately as availability failures**. Record sample size and model ID, never invent scores. Seed rows stay pre-classified; run evaluation independently, without queueing them all into live pipeline.
- **Comparison if primary looks weak:** test a small common 10-case subset (room, villa, wedding, offsite, complaint, Hinglish, mixed intent, missing dates) with alternate accessible Gemini Flash model or Anthropic only if actually configured; compare measured correct classification and usable draft rate. No automatic provider rotation on errors by default (it complicates quota and privacy); `rules` remains deterministic fallback.
- **Acceptance:** all correctness/security/PG gates must pass. Choose the API/model by real evaluation, not a declared reputation; no ungrounded numerical accuracy promise. Document limitations and examples. Prompt should explicitly prioritize complaint detection and avoid speculative dates, prices, promises and invented booking actions.

## 5. Performance and deployment constraints

- Guest response waits only for validated DB insert, **never for model**. No promise of millisecond latency without measurement. Short DB transactions, no unbounded scan or extra per-role tables. Indexed queue reads, batch 5 sweep.
- AI calls attempt once and retry once only where appropriate, with bounded timeout; rate limits 429 are operational failures, not classification mistakes. Provider logs contain no PII/secrets; free-tier traffic must use synthetic data only, per existing project privacy assumptions.
- Vercel Hobby cron may be only daily; sweep-on-inbox-load + on-ingest are primary. Confirm actual configured plan and Next/Vercel execution caps at deploy. Do not overwrite unrelated booking cron `vercel.json` entries.
- For pricing in enquiries, **do not enforce 3-month guest booking horizon here**; beyond horizon an enquiry is still valid. Prices are live nonbinding estimates only when underlying quote/availability support them.

## 6. Codex execution milestones and commits

| Order | Deliverable | Exit condition |
|---|---|---|
| **M0** | approved base SHA, branch, lock ownership, baseline checks, test DB isolation | no unexplained base conflicts |
| **M1 / R1** | provider-neutral standalone module, one structured API path, rules-only mode, tests | mocked provider tests pass; **5-case real Gemini smoke test** if key available |
| **M2 / R2** | `enquiries/internal.ts` tx bridge, claims/settles, `after()`+sweep, generation safety, docs exception | Postgres concurrency/recovery gate passes |
| **M3 / R3** | combined schema/prompt, PII sanitation, rules fallback, stable deterministic owner, complaints | routing and GM tests pass |
| **M4 / R4** | quote selection, price guard, safe template and one-call draft persistence | ENQ-4411 live quote regression + security/duplicate tests pass |
| **M5** | complete regression, 30-case live evaluation (if model credentials supplied), concise evidence in `06-progress.md`/`tdd-notes.md`, PR | typecheck/lint/unit/build/guarded PG green |
| **M6** | single independent Claude **code review**, fix blockers/majors, CI then authorised merge | **only then merge** |

Codex must return: base SHA, branch/HEAD, commit list, files touched, exact gates and counts actually run, model/API ID and verified quota/error behavior, evaluation report, remaining limitations, PR status and whether independent code review and merge authorisation exist. **Never claim live API quality if no credentials were available.**

## 7. Resolved design decisions D1–D7 (Claude's review incorporated)

- **D1:** R1 is its own `ai-provider` transport module; domain logic remains in `ai-router`.
- **D2:** target-role owner = first active staff user ordered by `created_at,id`; complaint to GM. Inspect actual active eligibility schema; no silent migration.
- **D3:** `ok` = model classification; `fallback` = rules classification; `failed` = no post-ingest result persisted; template fallback does not downgrade `ok`.
- **D4:** `rules-only` mode makes no network requests; keyword fallback in `ai-router`, <=0.5 confidence.
- **D5:** settle row `FOR UPDATE`, claim-generation check, conditional `INSERT ... WHERE NOT EXISTS` for draft/notification; no schema changes.
- **D6:** only `ai-router` imports `enquiries/internal` `tx` helpers; approved internal exception recorded in architecture.
- **D7:** unified Q2/Q9 form and 3-month public booking horizon are separate agreed product decisions, deferred from AI backend scope.

## 8. Review decisions applied (not new approvals)

Claude plan review: **APPROVE WITH FIXES**; no additional plan-review cycle. Changes accepted: (1) deterministic available cheapest matching-type quote for room queries, including villa sample, (2) single structured model call with draft, (3) batch-five sweep + throttled eval + isolated 429 counts, (4) explicit function maxDuration and recovery, (5) sweep-on-inbox/ingest primary vs daily Hobby cron, (6) one small Vercel AI SDK provider path. Only the independent *implementation code* review remains.

## 9. Absolute out-of-scope

No Q4–Q7 page implementation here; no consolidated Q2/Q9 guest form UI; no B6–B8/booking changes; no role management or sales escalation workflow; no new schema/migration; no automatic messaging; no production migrations/reseeds. If the approved base cannot support a required contract, report smallest deviation for permission rather than silently rewriting other modules.
