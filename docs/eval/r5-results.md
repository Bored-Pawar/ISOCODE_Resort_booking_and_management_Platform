# R5 AI quality evaluation

Run: 2026-11-09T00:25 UTC, `pnpm eval:ai --r5`, the 30 labelled synthetic seed enquiries (`src/db/seed/enquiries.data.ts`), prompt `enquiry-v2-audit`. Synthetic data only; no database writes; PII is redacted before any provider call (sender name and contact are never sent). Live calls spaced 4.5 s apart for the free tier. Raw JSON: [`ai-evaluation-live-model.json`](ai-evaluation-live-model.json), [`ai-evaluation-rules-only.json`](ai-evaluation-rules-only.json).

## Headline
| Metric | Groq `openai/gpt-oss-20b` | Rules only |
|---|---|---|
| Model category accuracy (structured answers counted) | 67% (30 measured) | n/a (no model) |
| End to end category (model, else rules fallback) | 29/30 | 30/30 |
| Schema validity (structured answer passed Zod) | 70% | n/a |
| Fallback to rules | 30% | 100% |
| Unsorted lane rate | 43% | 100% |
| **Complaint recall (every complaint notifies GM)** | **100%** | **100%** |
| GM alerts on non-complaints | 0 | 0 |
| Draft template fallback (model prose rejected or absent) | 47% | 100% |
| Safe model draft rate (of structured answers) | 76% | n/a |
| HTTP 429 seen (absorbed by key failover) | 7 | 0 |
| Timeouts | 0 | 0 |
| Median / p95 latency | 1588 / 2346 ms | n/a |

## Per category (end to end, after fallback)
| Category | Cases | Groq | Rules only |
|---|---|---|---|
| room | 9 | 9/9 (100%) | 9/9 (100%) |
| wedding | 6 | 6/6 (100%) | 6/6 (100%) |
| offsite | 5 | 5/5 (100%) | 5/5 (100%) |
| complaint | 5 | 5/5 (100%) | 5/5 (100%) |
| other | 5 | 4/5 (80%) | 5/5 (100%) |

## Grounding outcomes (server check of extracted dates, party, room against the message)
| Field | Groq | Rules only |
|---|---|---|
| dates | missing 22, ok 3, unsupported 5 | missing 27, ok 3 |
| guests | missing 27, ok 3 | missing 27, ok 3 |
| room | missing 25, ok 5 | missing 25, ok 5 |

"missing" means the message gives no checkable value; "unsupported" means the model's value could not be found in the message, so no quote is attached (fails safe). A quote is attached only when dates and guests are both `ok`.

## Findings
- **Complaint recall is 100 percent with both providers**, so no routing keyword change was needed (runbook Phase 3 step 3).
- 9 of 30 Groq answers failed Zod (`INVALID_RESPONSE`): ENQ-4410, ENQ-4383, ENQ-4389, ENQ-4392, ENQ-4394, ENQ-4397, ENQ-4403, ENQ-4406, ENQ-4407. Each fell back to the rules classifier and went to unsorted for a human, as designed. The structured schema is sent non-strict to Groq (its strict mode rejects our optional fields), so the model can return shapes Zod refuses. Not changed here (runbook: no other AI changes); options are a schema with every field required-but-nullable for Groq, or `openai/gpt-oss-120b`.
- Wrong but valid: ENQ-4408 (other read as room). Confidence and the grounding check decide the lane; a wrong room read without grounded dates gets no price.
- Rules only: every row is unsorted by design (confidence capped at 0.5), even though its keyword categories match all 30 labels. The rules set is tuned to this seed, so its 30/30 is not a generalisation claim.
- Draft fallback counts the safe template whenever model prose is missing, unsafe or the model failed; this eval passes no server quote (pricing needs the database), so price lines are not exercised here (covered by `price-guard` and `ai-routing` tests).
- The three brief enquiries: ENQ-4411 and ENQ-4412 classified by the model; ENQ-4410 hit `INVALID_RESPONSE` this run and was classified `wedding` by rules (unsorted). See `docs/final-check.md` for the database-backed routing check.

## Provider fix found by this run
The first Groq run returned HTTP 400 on every call: Groq's strict `json_schema` requires every property to be listed as required. `modules/ai-provider/transport.ts` now sends `providerOptions.groq.strictJsonSchema = false` for Groq only (unit tested); Zod validation is unchanged and still gates every answer.
