# Reproduce the R1–R4 Ollama review

Run from the repository root using its installed dependencies. This uses only `127.0.0.1:11434`, never reads `.env.local`, never imports a database client, and never downloads a model. It creates review evidence only. Ollama must already have `qwen3:4b-instruct` and `qwen2.5:7b`. On this Windows installation the CLI is `%LOCALAPPDATA%\Programs\Ollama\ollama.exe`; the HTTP API is checked independently of PATH.

Read [PROTOCOL.md](PROTOCOL.md) and the frozen expectations in [cases.ts](cases.ts). Do not compare totals across differently sized case subsets without naming the denominators. Use a fresh `--out` directory for each rerun; `runs.jsonl` appends to preserve interrupted runs.

```powershell
# Optional resource monitor, in another terminal (maximum 20 minutes).
powershell -NoProfile -File tests/benchmarks/ollama/monitor.ps1 -Seconds 1200

# Application prompt/schema/default samplers, with an explicit benchmark-only 30-minute timeout.
pnpm exec tsx --tsconfig tsconfig.json tests/benchmarks/ollama/run.mts --suite=baseline --repeats=1 --cold --out=docs/reviews/ollama-benchmark/rerun-baseline

# Same R1/R3 path, shared temperature/top-p, both models preloaded at 4096 context.
pnpm exec tsx --tsconfig tsconfig.json tests/benchmarks/ollama/run.mts --suite=controlled --repeats=3 --warm --out=docs/reviews/ollama-benchmark/rerun-controlled

# Optional shorter repetition if hardware/time prevents three full passes.
pnpm exec tsx --tsconfig tsconfig.json tests/benchmarks/ollama/run.mts --suite=controlled --repeats=2 --warm --subset --out=docs/reviews/ollama-benchmark/rerun-controlled-repeat

# Isolated experiments, never production changes.
pnpm exec tsx --tsconfig tsconfig.json tests/benchmarks/ollama/run.mts --suite=two-call --repeats=1 --warm --subset --out=docs/reviews/ollama-benchmark/rerun-two-call
pnpm exec tsx --tsconfig tsconfig.json tests/benchmarks/ollama/run.mts --suite=improved-single --repeats=1 --warm --subset --out=docs/reviews/ollama-benchmark/rerun-improved-single

# Recompute deterministic scores and queue every unreviewed unique draft.
pnpm exec tsx --tsconfig tsconfig.json tests/benchmarks/ollama/summarize.mts
```

`--subset` selects the 12 declared experimental cases without Windows comma-argument ambiguity. For custom cases, quote the entire argument, for example `'--cases=T01,T05'`; unknown/duplicate IDs fail before any model is loaded. The saved review can be regenerated with `subset.mts`, `resources.mts`, `audit.mts`, then `render-report.mts` after all ratings are complete. `sanitize.mts` redacts machine account paths in metadata/test reports while preserving raw model outputs. The historical report renderer/audit targets the recorded condition directory names and sample counts; rerun directories retain their own independently scored results.

Review `review-queue.json` against each complete input and extraction. Save ratings in `human-reviews.json` keyed by the queue's hash, with `quality` (1–5), `unsafe` (boolean), `perspective` and `notes`. Re-run the summarizer. Ratings are subjective, recorded judgements; do not replace them with heuristics or scores from another test case. `review-baseline.mts` preserves the evaluator's initial baseline judgements, not an automatic judge. Wire schema validation uses AJV from the existing ESLint dependency.

`environment.json` records installed model metadata and benchmark parameters; `first-request.json` records actual R1 serialization; `schemas/` holds distinct wire schemas; `runs.jsonl` preserves raw envelopes, parsed JSON, Zod results, application extraction/fallback, guard/template choice, routing, token counts, latency and `/api/ps`. `completed.json` records whether a suite finished. `scored.json`, `summary.json` and `test-matrix.md` are derived from those exact rows. The first historical baseline predates the per-schema hash enhancement but used one identical captured schema throughout.

Native empty-model warmup and unload requests are administrative HTTP operations, separately recorded; they produce no synthetic answer and must not be counted as generated enquiries. Count chat-completion attempts, logical operations and experimental stages separately. Timeouts have unknown token usage rather than zero reported consumption. No API tokens from the account are needed.

Selected isolated checks use mocked HTTP/module boundaries, not live Ollama or PostgreSQL:

```powershell
pnpm exec vitest run --project unit tests/unit/ollama-benchmark.test.ts src/modules/ai-router/draft.test.ts src/modules/ai-router/quote-selection.test.ts src/modules/ai-provider/provider.test.ts src/modules/ai-provider/http.test.ts src/modules/ai-router/wire.test.ts --reporter=json --outputFile=docs/reviews/ollama-benchmark/isolated-checks.json
pnpm typecheck
pnpm test
```
