# R1–R4 AI enquiry routing: architecture fault audit

## Metadata

| Item | Value |
|---|---|
| Audited SHA | `39d168f550cf9695c94f2dd54e6f98598cfdfec9` (`docs(ai-router): finalize verified R1-R4 review handoff`) |
| Branches at SHA | `codex/r1-r4-ai-routing`, `codex/r1-r4-ollama-benchmark` (both point here) |
| Merge base with `origin/main` | `e1e3d92d80ccfa6b2e89dd4fd23166bde11ba944` (8 commits ahead) |
| Audit worktree | `../resort-ai-routing-architecture-audit` (detached HEAD at the SHA, created fresh) |
| Uncommitted state also inspected (read-only) | `../resort-codex` working tree: `ai-provider/execute.ts` adds `LOCAL_ATTEMPT_TIMEOUT_MS = 30 min`, plus matching edits to `docs/04`, `docs/06`, `s2-ai-provider-setup.md`, `provider.test.ts`. `docs/reviews/r1-r4-ollama-model-benchmark.md`, `tests/benchmarks/**` and `tests/unit/ollama-benchmark.test.ts` are untracked. **None of this is in the SHA.** |
| Ran | `pnpm install --frozen-lockfile`; `pnpm test` (unit project only): **41 files, 299/299 pass**; two scratch `tsx` scripts outside the repo that call pure functions at the SHA (no DB, no network). The results are quoted as "reproduced" below. |
| Skipped | `test:integration` (shared DB), typecheck/lint/build, any model call or benchmark, `.env.local` (not read). |
| Changed | This file only. |

## Verdict: **BLOCK**

**1 BLOCKER, 7 MAJOR.** The lifecycle core is sound: claim and settle are atomic, settle is generation-guarded, staff edits win, and only one draft and one alert are written. The blocker is that unverified model extraction drives `pricing.quote()`. A draft can carry a real, correctly formatted price for dates or a party the guest never stated. The fixes are small and local to `ai-router`.

## Architecture map (one email enquiry)

```
[EXTERNAL] Postmark/WhatsApp ──POST──▶ /api/inbound/{email,whatsapp}  route.ts:2 maxDuration=60
   TRUST BOUNDARY 1: shared secret header           inbound-route.ts:28-31
   Zod payload                                       inbound-route.ts:47-58
   enquiries.ingestFrom()                            enquiries/index.ts:21-27
     TX#1 saveEnquiry: advisory lock on source id, insert ai_status='pending'   store.ts:46-71
     scheduleProcessing(id) → next/server after()   scheduling.ts:5-19   (runs after response, within maxDuration)
◀── 200 {received}
after():
   sweepCandidates(): SELECT … LIMIT 5, no lock     internal.ts:86-101
   Promise.allSettled(process(id) ×≤5)              scheduling.ts:15
   aiRouter.process → processEnquiry                processing.ts:11
     TX#2 claimEnquiry: SELECT … FOR UPDATE; UPDATE status=processing,
          attempts+1, ai_updated_at=ms(clock)        internal.ts:52-83
     redactPii(raw_text, sender)                     classify.ts:13, pii.ts:3-38
   TRUST BOUNDARY 2 (data leaves): [EXTERNAL] provider via executeStructured
          system=SYSTEM_PROMPT, prompt=JSON{referenceDateIST, guestMessage}   classify.ts:14-18, prompts.ts:16-18
          10 s/attempt (30 min local in uncommitted diff), ≤1 retry            execute.ts:57-93
   TRUST BOUNDARY 3 (model output in): Zod modelResponseSchema               execute.ts:81, schema.ts:33
          re-redact summary/text fields, classificationSchema.parse          classify.ts:21-32
          or rulesClassify (fallback)                                         fallback.ts:4
     route(): role from category; <0.70/fallback/other → no owner             routing.ts:2-13
     selectQuote(classification, REDACTED text)                               processing.ts:42
          [DB read] catalog.listRoomTypes, inventory.availability (releases expired holds),
          pricing.quote ×(types + ranked carts)                               quote-selection.ts:62-141
     buildDraft: guard(model prose) → else template; fill {{QUOTE}}         draft.ts:6-18
     TX#3 settleEnquiry: FOR UPDATE; check status/attempts/updatedAt; check untouched/staff fields;
          UPDATE enquiry, INSERT draft WHERE NOT EXISTS, INSERT notification WHERE NOT EXISTS,
          INSERT 'classified' event                                           internal.ts:114-193
Inbox: no Q4 page exists at this SHA. Only /dev/test calls enquiries.list() (dev/test/page.tsx:10), which schedules a sweep.
```

No transaction spans a network call. The three transactions are short. Nothing in the path imports `booking` or `payments`, or sets `sent_at` or `approved_by` (Q17 confirmed).

---

## BLOCKER

### B1. Unverified model-extracted dates and party reach `pricing.quote()` and produce a real-price draft

- **Where:** `processing.ts:42` → `quote-selection.ts:66-81` (inputs taken directly from `classification.dates/guests`); `schema.ts:3,9` (calendar and order checks only); `quote-selection.ts:68-70` (children silently default to 0); `draft.ts:13-17` (the template carries `{{QUOTE}}` too).
- **Failing scenario (benchmark T27, qwen3 4B, extended baseline):** the guest writes `2027-02-30 to 2027-03-01 for -2 adults and 1.5 children. Please help correct these details.` The model returns `from 2027-02-28, to 2027-03-01, adults 2, children 1`, confidence 0.98. That output passes Zod (reproduced, P7), so the status is `ok` and the enquiry is routed to reservations. `selectQuote` quotes 2 adults and 1 child for 28 Feb, and the draft reads "From ₹X **for your dates** … indicative live quote". The model prose was rejected there, but the template also contains `{{QUOTE}}`, so the price is attached either way. Reproduced (P8): a well-formed "We've adjusted your request to valid details. {{QUOTE}}" passes the guard and gets the real price.
  - Variant T10: an explicit past stay (`2026-10-14 to 2026-10-16`, reference date 2026-11-08) passes the schema (P7). Neither `pricing` (`pricing/types.ts:19-30`) nor `availability` rejects past dates, so it gets quoted wherever inventory rows exist.
  - Variant: "2 adults and our kids" leaves `children` undefined, which becomes 0 (`quote-selection.ts:68-70`). The cart is sized for 2, and the price is presented as the guest's.
  - Variant: "sometime in December, two of us". The prompt forbids inventing dates (`prompts.ts:8`), but no code enforces it.
- **Root cause:** extraction is validated for syntax, not grounding. The quote path treats model fields as facts, and the only check is that they look like ISO dates.
- **Existing mitigation:** a human approves every draft (never sent automatically), and the wording says "indicative" and "no room is held". The reviewer still has no signal that the dates were invented: the draft reads as a correct quote.
- **Smallest fix (inside `ai-router`, no contract change):** before `selectQuote`, compute `quoteable` from the **unredacted** `raw_text`:
  1. `from` and `to` each appear in the text (ISO form, or day plus month name with a year that matches the model's resolution).
  2. `from >= referenceDateIST`.
  3. `adults` appears as a number next to "adult(s)/guests/people" (or the form's `Guests:` line).
  4. If children are mentioned without a number, no quote.

  If `quoteable` is false, pass `quote = null` so the draft becomes a clarification request. Keep the classification as it is.
- **Evidence:** confirmed in code; seen in benchmark (T27 raw output; T10 called out in the benchmark's fault observations); schema acceptance and price attachment reproduced (P7, P8).

---

## MAJOR

### M1. Room preference is lost before room matching: villa enquiries can be quoted at the cheapest room

- **Where:** `processing.ts:42` passes `outcome.text`, which is the **redacted** text (`classify.ts:13,38`). `pii.ts:20` (`my name is …` consumes up to 70 letters and spaces). `quote-selection.ts:23-30` (only Latin-script `villa`/`suite` keywords).
- **Scenario (reproduced, P1′):** on WhatsApp, the sender is `Mrs Sharma` and the text is `Hi my name is Priya and we want the pool villa from 2026-12-20 to 2026-12-23 for 2 adults`. Redaction yields `Hi [NAME]2026-12-20 …`. `matchingRooms` falls back to all four types, so the cheapest cart (Plantation Room) is quoted for a Pool Villa request. The model never sees "pool villa" either. The same happens with a Devanagari `पूल विला` (no Latin match, so every type is eligible).
- **Root cause:** a privacy transform is reused as the business input, and the name regex is greedy.
- **Mitigation:** the web form appends `Room of interest:` on its own line, which survives (newline stops the regex). Email and WhatsApp have no such line.
- **Fix:** call `matchingRooms` and the room-count regex on `raw_text` (it never leaves the server), and bound the name pattern to 1–3 capitalised tokens. Add a Devanagari or transliteration alias for each room type, or return no quote when the text mentions a villa or suite in a script the matcher can't read.
- **Evidence:** reproduced by script; confirmed in code. No test covers room-name survival.

### M2. Lease vs local timeout: concurrent provider calls and possible livelock (uncommitted 30-minute change)

- **Where:** `internal.ts:7,47-50` (2-minute stale threshold, no heartbeat); `resort-codex` working tree `execute.ts:6,59-60` (`LOCAL_ATTEMPT_TIMEOUT_MS = 30 min` applied to **every** local call, including the queued app path); `processing.ts:69` (a superseded result is silently discarded).
- **Interleaving (with the diff applied, `AI_PROVIDER=local`, `next dev`):**
  1. t=0: ingest, then claim A1 (attempts=1, ts=T0). Call L1 starts and needs about 4 min (cold load or CPU offload, as the 7B run showed).
  2. t=2:05: another ingest or `/dev/test` load runs a sweep. The row is `processing` and older than 2 minutes, so claim A2 (attempts=2) starts L2 against the same Ollama. L1 is not aborted.
  3. t=4:00: L1 returns. `settle(A1)` sees attempts 1≠2 and returns null, so the work is thrown away.
  4. t=4:10: the next sweep claims A3 …

  While the sweep interval is shorter than L, no attempt ever settles. Each one adds load to a 6 GB GPU, which lengthens L further.
- **What is safe:** the late finisher **cannot overwrite**. Settle takes `FOR UPDATE` and requires `ai_status='processing' AND ai_attempts=n AND ai_updated_at=T` (`internal.ts:119-131`). The integration test `ai-processing.test.ts:111` covers this against a real DB.
- **At the committed SHA:** the provider budget is at most 10 s + 1 s (capped 429 delay) + 10 s ≈ 21 s, well under the 120 s lease, so no reclaim can happen during a live call. The risk exists only once the change lands.
- **Fix (smallest):** keep 10 s in `executeStructured`'s default and let the benchmark CLI pass a longer timeout explicitly. That matches the doc text the diff adds ("long local benchmarking runs through the CLI without queue claims"). Alternatively, derive `STALE_MS` as at least 2× the attempt timeout + margin.
- **Evidence:** confirmed in code (uncommitted diff). The benchmark notes the 30-minute allowance "does not prevent stale claims being recovered". Concurrency is not reproduced.

### M3. No attempt cap: a poison row is retried forever and can starve the sweep

- **Where:** `internal.ts:47-50,65-73` (no `ai_attempts` limit, no transition to `failed` apart from `STAFF_CHANGED`); `processing.ts:78-82` (any throw after the claim leaves the row `processing`); `classify.ts:21` (`.parse`, not `.safeParse`).
- **Scenario (trigger reproduced, P9):** the model returns a valid 490–500-character summary containing the sender's name. Re-redaction lengthens `Raj` to `[NAME]`, so the summary exceeds 500 characters and `classificationSchema.parse` throws a `ZodError`. The row stays `processing` and is reclaimed every ≥2 min on any traffic, with a new paid or GPU provider call each time. Any persistent settle error (constraint, oversized JSON) behaves the same way. Candidates are ordered by `ai_updated_at ASC` (`internal.ts:98`), so five such rows fill every sweep slot. A newer row whose own `after()` was killed is then never recovered.
- **Doc gap:** 07-R2 says "Failed rows stay visible with a Retry button", which implies a terminal `failed` state for exhausted attempts.
- **Fix:** add `ai_attempts < 3` to `queueEligibility`. When the cap is hit, set `failed/ATTEMPTS_EXHAUSTED` from the sweep or claim. Change `classify.ts:21` to `safeParse`, falling back to the rules result. No schema change is needed.
- **Evidence:** trigger reproduced by script; the loop is confirmed in code. No test exists.

### M4. Recovery depends only on traffic: a killed run's complaint can wait indefinitely for its GM alert

- **Where:** `scheduling.ts:5-19`; `enquiries/index.ts:25,40`; the only `list()` caller is `src/app/dev/test/page.tsx:10`. There is no cron.
- **Scenario:** a complaint arrives by email and Vercel kills the function mid-call (the platform limit, or 5 rows in parallel on a slow provider). The row stays `processing`. Nothing sweeps until the next enquiry arrives or someone opens `/dev/test`. No GM notification exists in the meantime. A future Q7 bell reading `notifications` would not sweep either.
- **Answer to Q2:** `after()` runs until the route's `maxDuration`, set to 60 s on the inbound routes; the `/enquire` action inherits the page or platform limit. A killed run's row is **not lost**: it's eligible after 2 min. But it is **stuck** until the next sweep trigger.
- **Doc conflict (needs the scrum master):** 07-R2 requires the sweep to run "on inbox load **and by cron**". 04 §R2 and the handoff say ingest plus `list()` and "no additional cron is necessary". Per CLAUDE.md the docs win, but they disagree with each other.
- **Fix:** a cron route (secret-guarded) that calls the same sweep every minute or two, plus a sweep on the Q4 and Q7 server loads.
- **Evidence:** confirmed in code. `scheduling.test.ts` mocks `after()`, so it tests registration only.

### M5. A complaint can get no GM notification when the model labels it room, wedding or offsite at ≥0.70

- **Where:** `routing.ts:3` (`notifyGm` is true only when the model's category is `complaint`); `fallback.ts:6` (narrow keyword list); `internal.ts:180-186`.
- **Scenarios:**
  1. Mixed intent: "room was not clean … also need a new room" (T18). The benchmark records qwen2.5 complaint priority at **3/12**; qwen3 got 12/12. A misclassification as `room` at 0.82 routes to reservations with no alert (reproduced, P6).
  2. Injection steering the category (T22 shows models follow overrides partially).
  3. Rules fallback: "AC was broken … room was dirty. Worst stay" gives `room`; "Room ganda tha, AC band tha, paise wapas chahiye" gives `room`; a Devanagari complaint gives `other` (reproduced, P5). On fallback, the GM still gets an **`unsorted`** alert (lane unsorted), so this is partially mitigated there, but `is_complaint` stays false.
- **Root cause:** safeguard 5 ("Complaints always alert GM") depends on a single uncalibrated model label, with no deterministic backstop on `ok`.
- **Fix:** run a broadened complaint detector (English, Hinglish, Devanagari) on the redacted text for **every** status. Set `notifyGm = model complaint OR detector hit`, without changing the owner.
- **Evidence:** confirmed in code; seen in benchmark; reproduced (P5, P6). The integration tests cover only outage and low-confidence complaints.

### M6. The prose guard passes Hindi prices and confirmations and refund promises, while rejecting most benign drafts

- **Where:** `price-guard.ts:9,17,34` (English word lists; `\d` without the `u` flag ignores Devanagari digits; NFKC does not map them).
- **Accepted (reproduced, P3):**
  - `Villa ka rate sirf ५००० रुपये prati raat hai. {{QUOTE}}`
  - `आपका विला कन्फर्म है। {{QUOTE}}`
  - `Aapki booking pakki ho gayi hai {{QUOTE}}`
  - `The villa is pachas hazaar …`
  - The complaint draft `We will reimburse you and compensate …`
- **Rejected benign (reproduced, P4):** "we have received your enquiry" and "feel free to share". The benchmark shows template fallback at **72%** (qwen3) and **67%** (qwen2.5), and one unsafe draft accepted per model. So the guard is both leaky for Hindi and too blunt to keep most model prose.
- **Q14:** the guard runs on model text **before** `{{QUOTE}}` is filled (`draft.ts:12-17`), so real prices never trip it. Missing or duplicate tokens fail (`price-guard.ts:14-15`).
- **Mitigation:** human approval; nothing is sent automatically.
- **Fix:** match `\p{Nd}` with the `u` flag (or map Devanagari digits to ASCII before checking), add Hindi and Hinglish currency, confirm and refund lexemes (`रुपये|हज़ार|लाख|पक्का|कन्फर्म|pakki|hazaa?r|wapas|reimburse|compensat`), and replace the bare `we have` and `free` bans with phrase-level patterns.
- **Evidence:** reproduced by script; seen in benchmark. The uncommitted `tests/unit/ollama-benchmark.test.ts:140-178` **asserts the buggy behaviour** (characterisation tests) and must be inverted along with the fix.

### M7. PII leaves the server: signature names, 8-digit landlines and addresses

- **Where:** `pii.ts:20` (names only after `my name is|name:|regards|contact person:`); `pii.ts:32-33` (phones need at least 9 digits).
- **Scenario (reproduced, P2):** `Thanks,\nPriya Sharma\nLandline 2345 6789` and `Best, Anjali Mehta, Flat 4B Palm Grove, Bandra West` go to the provider unchanged when the sender name doesn't match. Spelled-out numbers also pass. 04 §2 requires that "known sender names and embedded contact details are scrubbed". An 8-digit city landline is an embedded contact detail. The Google free tier may train on content (04 Providers).
- **Mitigation:** headers, emails, URLs, UPI and social handles, ≥9-digit numbers and the sender's own name are scrubbed; the handoff discloses that redaction is pattern-based.
- **Fix:** lower the phone threshold to 8 digits (stay dates are already split out before the scan), add sign-off lines (`thanks|best|cheers|warm wishes|sincerely` followed by a name line), and add an `address|flat|house no` line pattern.
- **Evidence:** reproduced by script. `classification.test.ts:28,67` cover headers and ≥9-digit numbers only.

---

## Direct answers

**Q1, lease vs timeout.** At the committed SHA there is **no** overlap. Each attempt aborts at 10 s, the worst case is about 21 s, and the lease is 120 s. A row is only reclaimed after its worker has died. With the uncommitted 30-minute local timeout, **yes**: any sweep after 2 minutes starts a second, concurrent provider call, the first one isn't aborted, and if inference takes longer than the sweep interval no attempt ever settles (livelock). In neither case can a late finisher overwrite newer work. Settle locks the row and requires `processing`, the same `ai_attempts` and the same millisecond `ai_updated_at` (`internal.ts:119-131`), with a real-DB test at `ai-processing.test.ts:111`. The damage is cost, GPU contention and starvation, not corruption (M2).

**Q13, unsupported values reaching pricing.** **Yes. This is the blocker.** Prices themselves always come from `pricing.quote()`, so the model never writes a number into the draft, but the **inputs** to the quote are the model's unverified dates and party. The benchmark's T27 shows a model "correcting" an impossible request into new dates and counts at confidence 0.98. Those pass Zod, get a real price, and the template inserts it as "for your dates" even when the model's prose is rejected (B1). Past dates are quoted (T10), unknown children become 0, and redaction or non-Latin text can erase a villa preference so the cheapest room is quoted (M1). Missing dates or adults, short stock and absent rates do correctly return no quote (`quote-selection.ts:71-110`, Q16). The gap is grounding, not missing values.

**Other questions in brief:**

- **Q3:** the sweep has `LIMIT 5`; claims use `FOR UPDATE`, not `SKIP LOCKED`, but the transactions are short, so this is fine.
- **Q4:** a retry cannot create a second draft or alert. Settle is serialised by the row lock, and the `NOT EXISTS` inserts run inside it. Staff reroutes and edits during processing cancel AI work as `failed/STAFF_CHANGED` (tested against the DB). The same `NOT EXISTS` would also block a future "regenerate" from saving a new draft, which is worth noting for Q6.
- **Q6:** guest text goes only in the user slot, JSON-encoded. The injection's effects are limited to category and draft (M5, M6).
- **Q7:** logs and `ai_last_error` hold codes or error names only.
- **Q8:** provider selection happens at call time, and a bad config yields `NOT_CONFIGURED`, which falls back to rules.
- **Q9:** the threshold and fallback are applied in code (`routing.ts:5`).
- **Q11:** owner selection is deterministic, based on `created_at,id`. There is no active flag, which the docs disclose.
- **Q12:** R08 is done for calendar validity, ordering, negative or fractional counts (the whole response is rejected, not coerced) and party consistency. Grounding is not done (B1). A guest's quoted competitor price can be stored as a budget (benchmark D08), but budget feeds nothing, so it is not major.
- **Q18:** there are no inbox pages, reprocess or retry actions, or `permissions.ts` at this SHA. Webhooks are secret-guarded, `/dev` is gated by `DEV_TOOLS_ENABLED`, and `/enquire` triggers processing by design (04). It has no rate limit, which is deferred to H2.

## Test gaps, ranked by risk

| Rank | Finding | Existing test | Real or mock |
|---|---|---|---|
| 1 | B1 grounding | None. `quote-selection.test.ts` gets the classification as given; integration ENQ-4411 uses explicit dates | real selection logic on fixtures; no grounding case |
| 2 | M1 room name lost | None (`classification.test.ts:67` checks that dates survive, not room names) | n/a |
| 3 | M5 complaint backstop | `ai-routing.test.ts:188,225` (outage and low confidence only) | real DB; no ≥0.70 mislabel or mixed case |
| 4 | M3 attempt cap or poison row | None | n/a |
| 5 | M2 in-flight reclaim | `ai-processing.test.ts:111` (settle guard, real DB); uncommitted `provider.test.ts` (30-minute timers, mocked SDK) | the guard is real; concurrency is untested |
| 6 | M6 multilingual guard | `draft.test.ts:8` (English). Uncommitted benchmark tests assert the bypass as current behaviour | pure; locks in the defect |
| 7 | M4 cron or traffic-free recovery | `scheduling.test.ts:42` (`after()` mocked) | mock only |
| 8 | M7 PII patterns | `classification.test.ts:28,67` | pure; misses signatures and landlines |

## Repair order

1. **B1 + M1** together (one `ai-router` change): a grounding gate on the unredacted text, room matching on `raw_text`, `from >= reference date`, no quote when children are unknown. Add tests for T27, T10, "my name is … pool villa" and Devanagari villa.
2. **M5:** a deterministic complaint detector ORed into `notifyGm` for every status.
3. **M3:** attempt cap → `failed/ATTEMPTS_EXHAUSTED`, and `safeParse` at `classify.ts:21`.
4. **M2:** before the 30-minute change lands, move the long timeout to the benchmark CLI only, or tie `STALE_MS` to the provider budget.
5. **M4:** get the scrum master to settle cron vs traffic (07 vs 04), then add the cron sweep.
6. **M6:** multilingual and phrase-level guard; invert the characterisation tests.
7. **M7:** extend the PII patterns.
