# 04 AI Router

## Flow
1. **Inbound**: web form, email webhook, WhatsApp simulator, event form. All normalise to one `enquiries` row (`ai_status='pending'`).
2. **Classify, extract and draft once**: AI SDK 7 `generateText({ output: Output.object(...) })` with router-owned Zod schema through independent `ai-provider`. Input is the redacted message and reference IST date; sender fields, source keys and consent metadata are excluded. Known sender names and embedded contact details are scrubbed.
3. **Validate**: Zod parse. Invalid output or API error triggers the rules fallback.
4. **Route** (deterministic code, not the model):
   1. category maps to owner role (room: reservations; wedding, offsite: sales; complaint: gm)
   2. confidence < 0.70 or `ai_status` in ('fallback','failed'): `lane='unsorted'`
   3. complaint: model category, supported `isComplaint` flag OR original-text English/Hinglish/Devanagari complaint detector always creates a GM notification, whatever the confidence. Mixed intents retain their category-selected owner; an alert does not change assignment.
5. **Draft**: the same response includes `draftText` with `{{QUOTE}}`. Currency, unlabelled numbers, discounts, action/availability promises and links fail the independent prose guard; a safe template replaces unsafe/absent prose without downgrading successful classification. Public catalog, inventory and B10 `pricing.quote({ rooms: [...] })` provide the lowest available matching base-plan estimate, including villa preferences and carts up to four lines. No eligible stock/rate or missing details means clarification without a price. Estimates explicitly take no hold.
6. **Human in the loop**: staff edit and approve. Nothing is sent automatically. Re route is one click and logged in `enquiry_events`.

## Output schema
Before any stock/rate reads, `groundExtraction(raw_text, classification, todayIST())` verifies dates and explicit adult/child counts against the original message on the server. Supported dates: ISO, Indian day/month[/year], English day-month or month-day, shared day ranges, and December–January rollover. An omitted year resolves to the next non-past occurrence; explicit years are respected. Conflicting/invalid/unsupported details fail closed without downgrading classification. Totals never imply adults. Omitted children are disclosed as an estimate assuming no children; unnumbered children require clarification. `extracted.grounding` persists dates/guests/room evidence (`ok|missing|unsupported`) for inbox consumers. The final price line uses server quote dates, party and catalog room names; templates cannot bypass grounding.
Room preference and room-count matching use original server text, independently of privacy redaction. English names plus Hindi/Hinglish aliases map only to Plantation Room, Estate Suite, Garden Villa and Pool Villa. Named villas never broaden to cheaper unrelated types when unavailable. Introduced names are bounded to name tokens and preserve adjacent booking requirements.

```ts
{
  category: 'room' | 'wedding' | 'offsite' | 'complaint' | 'other',
  confidence: number,          // 0..1
  dates: { from?: string, to?: string, text?: string },
  guests: { adults?: number, children?: number, total?: number },
  budget: { amountInr?: number, text?: string },
  language: string,
  summary: string,             // one line for the inbox
  draftText?: string | null    // model response only, not the frozen Classification type
}
```

## Providers (env `AI_PROVIDER`)
| Value | Use | Notes |
|---|---|---|
| `google` | Default for dev and demo | Gemini Flash free tier. Free tier content may be used by Google to improve products, so only synthetic seed data goes through it. Paid tier recommended for production (documented in TDD). |
| `local` | Dev fallback on own GPU | Ollama or similar, OpenAI compatible endpoint at `LOCAL_AI_BASE_URL`. Works only where the app and model run on the same network. |
| `anthropic` | Optional production option | |
| `groq` | Hosted, free tier friendly | `@ai-sdk/groq`, model from `AI_MODEL` (suggested `openai/gpt-oss-20b`, structured outputs). Keys `GROQ_API_KEY_1` to `_4`, tried in order, empty ones skipped. Failover rule below. Synthetic data only on a free tier. |
| `rules` | No key, tests, outages | Keyword classifier, confidence capped at 0.5, so always unsorted. |

Provider is chosen in `modules/ai-provider/factory.ts`. Model id comes from `AI_MODEL`; no hosted model ID is guessed when unset. Missing credentials/model yields sanitized `NOT_CONFIGURED` and rules fallback. Google remains the documented demo choice, subject to a real account/model smoke test; local Ollama is the intended development setup. See `s2-ai-provider-setup.md`.

**Groq key failover.** A 429 (rate limit or quota) or 401/403 from a key marks that key cooling down, in memory per server instance, for its `Retry-After` (else 60 s), and the next key is tried at once. Key switches happen inside the same 10 second attempt deadline, so the 21 second provider budget is unchanged; each key is tried at most once per attempt. Timeouts and 5xx keep the normal one retry. All keys failing, or all cooling, returns the sanitized code (`RATE_LIMIT` or `NOT_CONFIGURED`) and the rules fallback, so the enquiry goes to unsorted exactly as for any provider error. Key values, slot numbers and which key failed are never logged, stored or put in `ai_last_error`; the only log line is `groq key rotated` with a count. PII redaction and Zod validation are unchanged.

## Safeguards checklist
PII minimization supports known sender tokens, bounded introduced names, common sign-off name lines, email/mobile/8+ digit STD landlines, PIN-bearing address segments, forwarded headers and common IDs. Protected date/count tokens preserve adjacent booking and event requirements. Raw text is used only by server grounding/routing/matching and never sent in provider requests or error diagnostics. Limitations: arbitrary unintroduced names, addresses without recognized cues/PIN, spelled-out or unusual phone formats, and novel identifiers may escape patterns. This is minimization rather than universal entity recognition; human review and H2 privacy review remain necessary.

1. Application timeout **10 seconds per attempt for every provider**, at most one transient retry and at most one second Retry-After: maximum provider budget 21 seconds, below the unchanged 120-second stale lease. Abort signals reach the SDK HTTP request. Only the standalone benchmark CLI imports its explicit 30-minute deadline wrapper; application exports and environment configuration cannot select it.
2. `prompt_version` and `model` stored on every draft.
3. Never auto send.
4. No AI generated prices.
5. Complaints always alert GM.
6. Low confidence goes to unsorted.

## Evaluation
M6 guard: Hindi/Hinglish/English confirmations and financial/availability promises are rejected; Devanagari digits are normalized and numeric facts require original-text/server evidence. Guest budgets and refund acknowledgments are distinguished from business promises. Checks still precede trusted quote substitution. Saved-output replay across the unchanged 30 seeds is documented in `reviews/r1-r4-draft-guard-evaluation.md`; the under-30% template target remains unmet.

`pnpm eval:ai --smoke` runs the three brief messages plus a complaint and ambiguous case; `pnpm eval:ai` evaluates the existing 30 synthetic labels without database writes. Live calls are spaced 4.5 seconds apart. JSON evidence records confusion counts, schema/draft validity, fallback/unsorted rate, latency and separate HTTP 429/timeouts. Availability errors are excluded from model accuracy; invalid structured responses count against it. Rules reports contain no live-model accuracy/latency claim. No provider is automatically rotated (Groq rotates only between its own keys).

## Persistent processing (R2)
`pending` is saved before registering Next `after()`. Ingest and inbox loads schedule a bounded five-item sweep; the existing authenticated `/api/cron/expire-holds` route also runs one daily sweep at 00:00 UTC / 05:30 IST. Lazy recovery remains primary. Batch claims use `FOR UPDATE SKIP LOCKED`, incremented persisted attempts and millisecond database timestamps in a short transaction; workers process those exact generations without claiming again. Up to five stale exhausted rows are terminalized per sweep, independently of the five-item work batch. `processing` rows at least two minutes old are recoverable; terminal/failed/owned/human-edited rows are excluded. No network call holds a transaction. Settlement locks/rechecks generation and staff state and saves classification, metadata merge, one unapproved draft, one alert and one classification event atomically. Failed writes remain recoverable up to the attempt cap; human intervention cancels work with `failed/STAFF_CHANGED`. No automatic sending. The cron's 60-second hosting budget and provider's 21-second budget are separate; interrupted database work remains recoverable.

Roles without an active flag use all existing accounts of the role ordered `created_at,id`; if the role is absent, the enquiry stays unsorted. First eligible GM receives complaint (including fallback/low confidence) or unsorted alert. No GM account means no possible notification recipient; the complaint flag/unsorted row remain visible.

Audit remediation M3: claims increment actual processing attempts, capped at three. A caught third failure or a stale final claim becomes `failed/ATTEMPTS_EXHAUSTED`, unsorted, and never automatically claims again. Earlier failed writes remain stale-recoverable. `/admin/inbox` provides a bounded unsorted review queue and staff Retry. The approved additive `retryEnquiry` / `listReviewQueue` exports retain existing frozen list/process shapes. Retry requires reservations/sales/GM authorization, exact failed generation, an untouched new/unowned row and a row lock; reset and actor audit (`edited`, `ai:failed` → `ai:pending:retry`) commit together. That narrowly identified Retry event alone is exempt from the staff-edit exclusion. Retry never replaces successful classification or human edits. Grounding metadata is included in the review queue.

## Note for R1 to R3 (from Q1)
`enquiries.extracted` already holds `source` (webhook idempotency key) and, for web enquiries, `consent`. The classifier must merge its output into `extracted` (for example `{ ...existing, ...result }`), never replace the column, or repeated webhook deliveries would create duplicates. Web enquiries put dates, party size and room into `raw_text` as plain lines after the guest message; contact details are never in `raw_text`.
