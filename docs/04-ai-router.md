# 04 AI Router

## Flow
1. **Inbound**: web form, email webhook, WhatsApp simulator, event form. All normalise to one `enquiries` row (`ai_status='pending'`).
2. **Classify, extract and draft once**: AI SDK 7 `generateText({ output: Output.object(...) })` with router-owned Zod schema through independent `ai-provider`. Input is the redacted message and reference IST date; sender fields, source keys and consent metadata are excluded. Known sender names and embedded contact details are scrubbed.
3. **Validate**: Zod parse. Invalid output or API error triggers the rules fallback.
4. **Route** (deterministic code, not the model):
   1. category maps to owner role (room: reservations; wedding, offsite: sales; complaint: gm)
   2. confidence < 0.70 or `ai_status` in ('fallback','failed'): `lane='unsorted'`
   3. complaint: always create a GM notification, whatever the confidence
5. **Draft**: the same response includes `draftText` with `{{QUOTE}}`. Currency, unlabelled numbers, discounts, action/availability promises and links fail the independent prose guard; a safe template replaces unsafe/absent prose without downgrading successful classification. Public catalog, inventory and B10 `pricing.quote({ rooms: [...] })` provide the lowest available matching base-plan estimate, including villa preferences and carts up to four lines. No eligible stock/rate or missing details means clarification without a price. Estimates explicitly take no hold.
6. **Human in the loop**: staff edit and approve. Nothing is sent automatically. Re route is one click and logged in `enquiry_events`.

## Output schema
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
| `rules` | No key, tests, outages | Keyword classifier, confidence capped at 0.5, so always unsorted. |

Provider is chosen in `modules/ai-provider/factory.ts`. Model id comes from `AI_MODEL`; no hosted model ID is guessed when unset. Missing credentials/model yields sanitized `NOT_CONFIGURED` and rules fallback. Google remains the documented demo choice, subject to a real account/model smoke test; local Ollama is the intended development setup. See `s2-ai-provider-setup.md`.

## Safeguards checklist
1. Timeout 10 s, one retry, then fallback.
2. `prompt_version` and `model` stored on every draft.
3. Never auto send.
4. No AI generated prices.
5. Complaints always alert GM.
6. Low confidence goes to unsorted.

## Evaluation
`pnpm eval:ai --smoke` runs the three brief messages plus a complaint and ambiguous case; `pnpm eval:ai` evaluates the existing 30 synthetic labels without database writes. Live calls are spaced 4.5 seconds apart. JSON evidence records confusion counts, schema/draft validity, fallback/unsorted rate, latency and separate HTTP 429/timeouts. Availability errors are excluded from model accuracy; invalid structured responses count against it. Rules reports contain no live-model accuracy/latency claim. No provider is automatically rotated.

## Persistent processing (R2)
`pending` is saved before registering Next `after()`. Ingest and inbox `list()` schedule a bounded five-item sweep; claims use row locks and an incremented persisted attempt plus millisecond database timestamp. `processing` rows at least two minutes old are recoverable; terminal/failed/owned/human-edited rows are excluded. No network call holds a transaction. Settlement locks/rechecks the generation and staff state and saves classification, metadata merge, one unapproved draft, one alert and one classification event atomically. A failed write leaves processing recoverable; human intervention cancels AI work with `failed/STAFF_CHANGED`. There is no public retry endpoint or automatic sending.

Roles without an active flag use all existing accounts of the role ordered `created_at,id`; if the role is absent, the enquiry stays unsorted. First eligible GM receives complaint (including fallback/low confidence) or unsorted alert. No GM account means no possible notification recipient; the complaint flag/unsorted row remain visible.

## Note for R1 to R3 (from Q1)
`enquiries.extracted` already holds `source` (webhook idempotency key) and, for web enquiries, `consent`. The classifier must merge its output into `extracted` (for example `{ ...existing, ...result }`), never replace the column, or repeated webhook deliveries would create duplicates. Web enquiries put dates, party size and room into `raw_text` as plain lines after the guest message; contact details are never in `raw_text`.
