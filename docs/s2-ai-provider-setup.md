# S2 provider setup

R1–R4 uses AI SDK 7.0.164, Google 4.0.113, Anthropic 4.0.98 and OpenAI-compatible 3.0.86. One `generateText`/`Output.object` call returns classification, extraction and draft prose. Transport retries once for transient errors. Hosted providers abort at ten seconds per attempt; local Ollama has thirty minutes per attempt, explicitly approved by the scrum master on 2026-11-08 for laptop benchmarking. Retry-After remains bounded. No key, prompt, output or SDK error message is logged.

Historical implementation-handoff snapshot (before this benchmark, 2026-11-08): hosted keys absent, local endpoint/model unset, `ollama` executable not on PATH; no live-model result was available then. The subsequent local benchmark verified the installed Ollama executable and two models; see `reviews/r1-r4-ollama-model-benchmark.md`. Tests use synthetic messages and mocked SDK calls; the earlier PostgreSQL quote tests use the real public pricing service.

For the intended local setup, install Ollama separately with the user's confirmation. The following manual commands download a large model; Codex has not run them or changed GPU/machine settings:

```powershell
winget install --id Ollama.Ollama --exact
ollama pull qwen3:4b
ollama serve
```

If the Ollama desktop service is already running, omit `ollama serve`. In `.env.local` set:

```dotenv
AI_PROVIDER=local
AI_MODEL=qwen3:4b
LOCAL_AI_BASE_URL=http://localhost:11434/v1
```

Then run `pnpm eval:ai --smoke` before `pnpm eval:ai`. The extended local deadline accommodates cold loading and CPU offloading, but remains finite; errors and timeouts still fall back. The original ten-second benchmark and the rerun are preserved separately in `reviews/ollama-benchmark/`. RTX 4050/6 GB was detected during the benchmark. Hosted Vercel cannot reach a developer's localhost; hosted deployment needs an accessible provider configured through env. A suitable hosted API is expected to reduce local hardware limitations, but Haiku latency/reliability remains unmeasured until a paid smoke test is separately approved.

For Google set `AI_PROVIDER=google`, `GOOGLE_GENERATIVE_AI_API_KEY`, and an `AI_MODEL` actually listed/available in the project's Google AI Studio account. Use synthetic data only on the free tier. No assumed Flash model is set by default; run the five-case smoke before the thirty-case evaluation.

For hosted Anthropic Haiku set `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, and `AI_MODEL` to an accessible Haiku model ID from the account. No code change/provider rotation is required. `AI_PROVIDER=rules` makes zero model/network calls and always leaves classification unsorted; it can still use database-backed availability/pricing for a safe estimate.

The inbound route handlers export `maxDuration=60`; five workers run concurrently after the response. The `/enquire` and `/dev/test` server actions inherit their page/platform duration: no misleading export is added to action files and their guest/dev pages are outside this assignment. Inbox callers get sweep registration from `enquiries.list()`. Platform truncation leaves claims recoverable after two minutes. No additional cron is necessary here; the booking cron is unchanged. Confirm the actual deployment plan/duration before deploying.

Automatic estimates cover EP base plans, at most four room lines and stays up to 180 nights (bounded work, not a three-month booking horizon). Missing details, unsupported plans/longer stays, or short stock go to staff for clarification. Quotes are indicative and never reserve inventory. PII scrubbing is conservative pattern-based minimization, not a general-purpose entity-recognition system; production privacy assurance remains part of H2.

References: [structured SDK output](https://ai-sdk.dev/cookbook/node/generate-object), [Ollama Windows setup](https://docs.ollama.com/windows), [qwen3:4b](https://ollama.com/library/qwen3:4b). Next execution-duration behavior was checked in the installed Next 16.4.5 docs (`after.md`, `maxDuration.md`) and both inbound duration exports are present in `.next/server/functions-config-manifest.json`.
