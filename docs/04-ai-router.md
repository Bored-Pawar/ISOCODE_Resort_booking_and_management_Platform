# 04 AI Router

## Flow
1. **Inbound**: web form, email webhook, WhatsApp simulator, event form. All normalise to one `enquiries` row (`ai_status='pending'`).
2. **Classify and extract**: LLM via `generateObject` with a Zod schema. Only `raw_text` is sent. Names, phone numbers and emails are never sent to the model.
3. **Validate**: Zod parse. Invalid output or API error triggers the rules fallback.
4. **Route** (deterministic code, not the model):
   1. category maps to owner role (room: reservations; wedding, offsite: sales; complaint: gm)
   2. confidence < 0.70 or `ai_status` in ('fallback','failed'): `lane='unsorted'`
   3. complaint: always create a GM notification, whatever the confidence
5. **Draft**: LLM writes the reply with a `{{QUOTE}}` placeholder. Server fills it from `pricing.quote()` when dates and guests are known; otherwise a line asking for them. Any digit sequence that looks like a price in the model output is rejected and the draft is regenerated or falls back to a template.
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
  summary: string              // one line for the inbox
}
```

## Providers (env `AI_PROVIDER`)
| Value | Use | Notes |
|---|---|---|
| `google` | Default for dev and demo | Gemini Flash free tier. Free tier content may be used by Google to improve products, so only synthetic seed data goes through it. Paid tier recommended for production (documented in TDD). |
| `local` | Dev fallback on own GPU | Ollama or similar, OpenAI compatible endpoint at `LOCAL_AI_BASE_URL`. Works only where the app and model run on the same network. |
| `anthropic` | Optional production option | |
| `rules` | No key, tests, outages | Keyword classifier, confidence capped at 0.5, so always unsorted. |

Provider is chosen in one place, `modules/ai-router/provider.ts`. Model id comes from `AI_MODEL`.

## Safeguards checklist
1. Timeout 10 s, one retry, then fallback.
2. `prompt_version` and `model` stored on every draft.
3. Never auto send.
4. No AI generated prices.
5. Complaints always alert GM.
6. Low confidence goes to unsorted.

## Evaluation
Seeded 30 labelled enquiries. `pnpm eval:ai` reports accuracy per category and the unsorted rate. Tests mock the provider and cover: invalid JSON goes unsorted, complaint creates notification, draft contains no number not present in the quote.
