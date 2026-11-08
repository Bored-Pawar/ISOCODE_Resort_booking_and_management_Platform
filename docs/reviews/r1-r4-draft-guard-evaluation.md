# R1–R4 draft guard replay

Deterministic replay of archived synthetic outputs, not fresh model inference. All 30 original seed cases are unchanged. Baseline guard was copied unchanged before M6 into `tests/benchmarks/ollama/guard-baseline.ts`. The replay uses original guest messages for grounding and checks original model prose before server quote substitution. Source SHA256 hashes and every decision/sample are in `r1-r4-draft-guard-replay.json`.

| Saved suite | Model | Samples | Before fallback | After fallback | Change |
|---|---|---:|---:|---:|---:|
| Extended baseline | Qwen3 4B | 30 | 22/30, 73.3% | 19/30, 63.3% | −10.0 pp |
| Extended baseline | Qwen2.5 7B | 30 | 25/30, 83.3% | 24/30, 80.0% | −3.3 pp |
| Extended controlled, three passes | Qwen3 4B | 90 | 65/90, 72.2% | 61/90, 67.8% | −4.4 pp |
| Extended controlled, three passes | Qwen2.5 7B | 90 | 60/90, 66.7% | 56/90, 62.2% | −4.4 pp |

Under 30% is **not achieved**. Missing/duplicate tokens, availability claims, wrong perspective and unsupported facts still require templates. Safety was not weakened to hit the target. No new inference, provider switch, second production model call or database operation was used.

The implementation author's review of accepted replay prose found **zero remaining unsupported financial, availability or booking commitments**. This is an observation on saved outputs, not independent semantic certification. Initial replay exposed compound “will investigate … and process your refund” and “ensure to meet your budget” promises; both were corrected and regression-tested before the final recorded metrics. The old guard's accepted T27 “We've corrected the date range …” is rejected; B1 independently prevents a corresponding quote.

Harmless rejections remain. Controlled Qwen3 T11/pass 3 acknowledges “250 guests … two-night stay”; incomplete model date extraction prevents verifying its duration. Month-name event dates with only one endpoint can also fail the limited two-date context. Examples now accepted include “We have received your enquiry”, “Feel free to share”, refund acknowledgments without promises, catalog preferences, guest-stated budgets and verified dates/counts including Devanagari digits.

Adversarial unit cases cover Hindi prices/confirmations, ₹/रु/रुपये/Rs/INR, Devanagari digits, English/Hinglish financial promises, availability guarantees, invented budgets/counts, wrong perspective and missing/duplicate placeholders. No unsafe case in that explicit regression corpus passes. Patterns cannot cover every language, paraphrase or indirect promise; human approval remains mandatory.

Reproduce without env loading or external calls:

```powershell
pnpm exec tsx --tsconfig tsconfig.json tests/benchmarks/ollama/replay-draft-guard.mts
```
