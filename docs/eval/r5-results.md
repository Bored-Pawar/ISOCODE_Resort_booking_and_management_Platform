# R5 AI quality evaluation

Run: 2026-11-09T00:25 UTC, `pnpm eval:ai --r5`, the 30 labelled synthetic seed enquiries (`src/db/seed/enquiries.data.ts`), prompt `enquiry-v2-audit`. Synthetic data only; no database writes; PII is redacted before any provider call (sender name and contact are never sent). Live calls spaced 4.5 s apart for the free tier. Raw JSON: [`ai-evaluation-live-model.json`](ai-evaluation-live-model.json), [`ai-evaluation-rules-only.json`](ai-evaluation-rules-only.json).

## Headline
| Metric | Groq `openai/gpt-oss-20b` | Rules only |
|---|---|---|
| Model category accuracy (invalid answers counted wrong) | 20/30 (67%); 20/21 of valid answers (95%) | n/a (no model) |
| End to end category (Groq: 21 model rows, 20 correct, plus 9 rules-fallback rows, 9 correct; the rules are seed tuned) | 29/30 | 30/30 |
| Valid structured answer | 70% | n/a |
| Fallback to rules | 30% | 100% |
| Unsorted lane rate | 43% | 100% |
| **Complaint recall (every complaint notifies GM), n = 5** | **5/5** | **5/5** |
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

## Grounding outcomes (server check of the extracted dates and party against its own parse of the message; room from the message only)
| Field | Groq | Rules only |
|---|---|---|
| dates | missing 22, ok 3, unsupported 5 | missing 27, ok 3 |
| guests | missing 27, ok 3 | missing 27, ok 3 |
| room | missing 25, ok 5 | missing 25, ok 5 |

"missing" means the classifier did not extract a full date range; for guests, that the message has no adult count or the classifier gave none. "unsupported" means the extracted value differs from the server's own parse of the text, which may be a model error or a parser gap; either way no quote is attached (fails safe). A quote is attached only when dates and guests are both `ok`. Room grounding reads only the message (`roomPreference`), so it is the same for both providers.

## Findings
- **Complaint recall is 100 percent with both providers**, so no routing keyword change was needed (runbook Phase 3 step 3).
- 9 of 30 Groq calls ended in the sanitized `INVALID_RESPONSE`: ENQ-4410, ENQ-4383, ENQ-4389, ENQ-4392, ENQ-4394, ENQ-4397, ENQ-4403, ENQ-4406, ENQ-4407. That code covers Zod refusing the output or the classification, the AI SDK's own parse or validation errors, and any provider 4xx other than 401, 403, 408 and 429 (e.g. Groq `json_validate_failed`); output cut short by the 1,800 token cap on a reasoning model is also possible. The eval does not record which, so **the cause is not established**. Each fell back to the rules classifier and went to unsorted for a human, as designed. Hypotheses to test later (not changed here; runbook: no other AI changes): a Groq-friendly schema (every field required, nullable), a higher output cap, or `openai/gpt-oss-120b`; and recording a sanitized sub-reason per eval row.
- Wrong but valid: ENQ-4408 (other read as room). Confidence and the grounding check decide the lane; a wrong room read without grounded dates gets no price.
- Rules only: every row is unsorted because `route()` gives no owner when the status is not `ok` (the rules classifier always reports `fallback`), whatever its keyword category. Its keyword categories match all 30 labels, but the rules are tuned to this seed, so 30/30 (and complaint recall over n = 5) is not a generalisation claim.
- Draft fallback counts the safe template whenever model prose is missing, unsafe or the model failed; this eval passes no server quote (pricing needs the database), so price lines are not exercised here (covered by `price-guard` and `ai-routing` tests).
- The three brief enquiries: ENQ-4411 and ENQ-4412 classified by the model; ENQ-4410 hit `INVALID_RESPONSE` this run and was classified `wedding` by rules (unsorted). The database-backed routing check is Phase 6 (`docs/final-check.md`, written then).

## Provider fix found by this run
The first Groq run returned HTTP 400 on every call: Groq's strict `json_schema` requires every property to be listed as required. `modules/ai-provider/transport.ts` now sends `providerOptions.groq.strictJsonSchema = false` for Groq only (unit tested); Zod validation is unchanged and still gates every answer. The failing run's JSON was overwritten by the rerun and is not kept.
