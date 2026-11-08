import { readFile, writeFile } from "node:fs/promises";
import { cases } from "./cases";
type Rate = { n: number; d: number; rate: number | null };
type Summary = {
  evidence: string;
  model: string;
  operations: number;
  httpRequests: number;
  rawClassification: Rate;
  validatedClassification: Rate;
  applicationCategory: Rate;
  wireSchema: Rate;
  zodSchema: Rate;
  extraction: Rate;
  extractionByField: Record<string, Rate>;
  guardSafety: Rate;
  quoteRoom: Rate;
  quoteAll: Rate;
  fallback: Rate;
  templateFallback: Rate;
  timeouts: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  humanReviewCoverage: number;
  generatedDrafts: number;
  humanUnsafe: number;
  humanQualityMean: number | null;
  tokens: { input: number; output: number; reportedRequests: number; unknownRequests: number };
  resourceSamples: { name: string; size: number; size_vram: number; context_length: number }[];
  complaintPriority: Rate;
  ambiguityUnsorted: Rate;
  unsafeAcceptedByGuard: number;
  quoteByModelCategory: Rate;
};
const root = "docs/reviews/ollama-benchmark";
const editorial: {
  executiveSummary: string;
  architectureFindings: string;
  finalRecommendation: string;
} = JSON.parse(await readFile(`${root}/editorial.json`, "utf8"));
const audit: {
  passed: boolean;
  totalChatAttempts: number;
  maxPromptTokens: number;
  maxCompletionTokens: number;
} = JSON.parse(await readFile(`${root}/audit.json`, "utf8"));
if (!audit.passed) throw new Error("Evidence audit must pass before reporting");
const units: { numPassedTests: number; numFailedTests: number; success: boolean } = JSON.parse(
  await readFile(`${root}/unit-regression.json`, "utf8"),
);
if (!units.success || units.numFailedTests)
  throw new Error("Unit regression must pass before reporting");
const data: Summary[] = JSON.parse(await readFile(`${root}/summary.json`, "utf8"));
const models = ["qwen3:4b-instruct", "qwen2.5:7b"];
const get = (e: string, m: string) => {
  const v = data.find((s) => s.evidence === e && s.model === m);
  if (!v) throw new Error(`Missing ${e}/${m}`);
  return v;
};
for (const s of data)
  if (s.humanReviewCoverage !== s.generatedDrafts)
    throw new Error(`Unreviewed drafts ${s.evidence}/${s.model}`);
if ((JSON.parse(await readFile(`${root}/review-queue.json`, "utf8")) as unknown[]).length)
  throw new Error("Review queue not empty");
for (const e of ["extended-baseline", "extended-controlled", "two-call", "improved-single"])
  await readFile(`${root}/${e}/completed.json`, "utf8");
const rate = (v: Rate) => (v.d ? `${v.n}/${v.d} (${((v.n / v.d) * 100).toFixed(1)}%)` : "N/A");
const secs = (n: number) => `${(n / 1000).toFixed(2)} s`;
const mean = (v: number | null) => (v === null ? "N/A" : v.toFixed(2) + "/5");
function scorecard(e: string) {
  const [a, b] = models.map((m) => get(e, m));
  const rows: [string, string, string][] = [
    ["Logical enquiries", String(a.operations), String(b.operations)],
    ["Raw category match", rate(a.rawClassification), rate(b.rawClassification)],
    ["Complaint priority / GM flag", rate(a.complaintPriority), rate(b.complaintPriority)],
    ["Ambiguous/invalid cases kept unsorted", rate(a.ambiguityUnsorted), rate(b.ambiguityUnsorted)],
    [
      "Correct category with valid extraction",
      rate(a.validatedClassification),
      rate(b.validatedClassification),
    ],
    ["Extraction fields (including absence/completeness)", rate(a.extraction), rate(b.extraction)],
    ["Exact wire JSON Schema pass", rate(a.wireSchema), rate(b.wireSchema)],
    ["Application Zod pass", rate(a.zodSchema), rate(b.zodSchema)],
    ["Human draft quality", mean(a.humanQualityMean), mean(b.humanQualityMean)],
    [
      "Objectively unsafe drafts",
      `${a.humanUnsafe}/${a.generatedDrafts}`,
      `${b.humanUnsafe}/${b.generatedDrafts}`,
    ],
    ["Deterministic prose guard pass", rate(a.guardSafety), rate(b.guardSafety)],
    [
      "Unsafe drafts accepted by guard",
      String(a.unsafeAcceptedByGuard),
      String(b.unsafeAcceptedByGuard),
    ],
    ["Literal room {{QUOTE}} compliance", rate(a.quoteRoom), rate(b.quoteRoom)],
    [
      "Token contract for model-declared category",
      rate(a.quoteByModelCategory),
      rate(b.quoteByModelCategory),
    ],
    ["Classification fallback", rate(a.fallback), rate(b.fallback)],
    ["Draft template fallback", rate(a.templateFallback), rate(b.templateFallback)],
    ["Median latency incl. retries/errors", secs(a.medianLatencyMs), secs(b.medianLatencyMs)],
    ["Nearest-rank p95 latency", secs(a.p95LatencyMs), secs(b.p95LatencyMs)],
    [
      "Reported input/output tokens",
      `${a.tokens.input}/${a.tokens.output}`,
      `${b.tokens.input}/${b.tokens.output}`,
    ],
    ["Timeout operations", String(a.timeouts), String(b.timeouts)],
    ["GPU loading", "100% GPU, context 4096", "18%/82% CPU/GPU, context 4096"],
  ];
  return [
    "| Metric | Qwen3 4B | Qwen2.5 7B |",
    "|---|---|---|",
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}
const requests = data.reduce((n, s) => n + s.httpRequests, 0) + 1;
const operations = data.reduce((n, s) => n + s.operations, 0);
const [a, b] = models.map((m) => get("extended-controlled", m));
const casesTable = [
  "| ID | Scenario | Expected |",
  "|---|---|---|",
  ...cases.map(
    (c) =>
      `| ${c.id} | ${c.scenario} | ${c.expected.categories.join(" / ")}${c.expected.lowConfidence ? "; confidence <0.70 / clarification" : ""} |`,
  ),
].join("\n");
const fieldTable = [
  "| Field | Qwen3 4B | Qwen2.5 7B |",
  "|---|---|---|",
  ...Object.keys(a.extractionByField).map(
    (p) => `| ${p} | ${rate(a.extractionByField[p])} | ${rate(b.extractionByField[p])} |`,
  ),
].join("\n");
type Architecture = {
  evidence: string;
  model: string;
  n: number;
  correctValidated: number;
  fieldCorrect: number;
  fieldCount: number;
  quality: number | null;
  generated: number;
  unsafe: number;
  quoteCorrect: number;
  quoteCount: number;
  medianMs: number;
  input: number;
  output: number;
};
const architectures: Architecture[] = JSON.parse(
  await readFile(`${root}/architecture-comparison.json`, "utf8"),
);
const comparison = [
  "| Model / architecture (same 12 cases) | n | Valid classification | Extraction | Draft quality | Unsafe | Room quote | Median total | Mean input/output tokens per enquiry |",
  "|---|---:|---|---|---|---|---|---|---|",
  ...architectures.map(
    (s) =>
      `| ${s.model} / ${s.evidence} | ${s.n} | ${s.correctValidated}/${s.n} | ${s.fieldCorrect}/${s.fieldCount} | ${mean(s.quality)} (${s.generated}/${s.n} drafts) | ${s.unsafe}/${s.generated} | ${s.quoteCorrect}/${s.quoteCount} | ${secs(s.medianMs)} | ${(s.input / s.n).toFixed(1)}/${(s.output / s.n).toFixed(1)} |`,
  ),
].join("\n");
const implementation = (
  await readFile("tests/benchmarks/ollama/implementation-review.md", "utf8")
).replace(/^## /gm, "### ");
const defects = await readFile("tests/benchmarks/ollama/defects.md", "utf8");
const matrix = await readFile(`${root}/test-matrix.md`, "utf8");
const examples = [];
for (const [e, m, id, why] of [
  ["baseline", "qwen3:4b-instruct", "T09", "Good resort-to-guest draft with correct dates/family"],
  ["extended-baseline", "qwen3:4b-instruct", "T27", "Unsafe invented correction"],
  ["extended-baseline", "qwen2.5:7b", "T14", "Good corporate-offsite response"],
  ["extended-baseline", "qwen2.5:7b", "T22", "Injected false confirmation and invented amount"],
] as const) {
  const rows = (await readFile(`${root}/${e}/runs.jsonl`, "utf8"))
    .trim()
    .split("\n")
    .map((s) => JSON.parse(s));
  const row = rows.find(
    (r: { model: string; id: string; run: number }) => r.model === m && r.id === id && r.run === 1,
  );
  examples.push(
    `### ${m}, ${e}, ${id}/1 — ${why}\n\nActual raw model content (not a merged representative):\n\n\`\`\`json\n${row.rawResponses.at(-1).content}\n\`\`\`\n\nApplication status: **${row.application.status}**; error: **${row.application.response.error ?? "none"}**; template fallback: **${row.metrics.draftTemplateFallback}**.`,
  );
}
const inventory = [];
for (const s of data)
  inventory.push(
    `| ${s.evidence} | ${s.model} | ${s.operations} | ${s.httpRequests} | ${s.timeouts} | ${s.tokens.unknownRequests} |`,
  );
const report = `# R1–R4 Ollama model benchmark and quality review

Review date: 8 November 2026 IST. Source base: 39d168f. Evidence distinguishes original 10-second runs, the user-authorized extended-timeout rerun, controlled sampling, mocked checks, historical PostgreSQL evidence and isolated architecture experiments.

## 1. Executive summary

${editorial.executiveSummary}

The primary controlled comparison covers **${a.operations} runs per model** (30 cases × 3 independent runs), through the actual R1 adapter and unchanged production R3 prompt/schema. Qwen3 raw category match is ${rate(a.rawClassification)}; Qwen2.5 is ${rate(b.rawClassification)}. Human draft means are ${mean(a.humanQualityMean)} and ${mean(b.humanQualityMean)}. Room token compliance is ${rate(a.quoteRoom)} and ${rate(b.quoteRoom)}. Median request latency is ${secs(a.medianLatencyMs)} versus ${secs(b.medianLatencyMs)}. These are measured sample results, not a calibrated forecast.

The GPU is an RTX 4050 Laptop with 6141 MiB VRAM. Qwen3 loads fully on GPU; 7B is partly offloaded. Increasing the local deadline solved the observed cold-load cancellation loop; it did not increase VRAM or guarantee prose safety. Hosted Haiku has not been called, so production latency/reliability is a proposed expectation, not a benchmark result.

## 2. Implementation and pricing/fallback inspection

${implementation}

## 3. Environment and methodology

Windows, Node 22.14.0, Ollama **0.40.15**, NVIDIA driver **592.82**. Endpoint: http://127.0.0.1:11434/v1/chat/completions. Ollama was reachable despite its executable not being on PATH; list/version/ps were run using the installed absolute CLI path.

| Model | Installed digest | Disk bytes | Quantization |
|---|---|---:|---|
| qwen3:4b-instruct | 0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0 | 2497293803 | Q4_K_M (4.0B) |
| qwen2.5:7b | 845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e | 4683087332 | Q4_K_M (7.6B) |

All cases are synthetic. Expectations in cases.ts were defined before generation; reference IST date stays 2026-11-08. Initial baseline used untouched production serialization with model defaults. After the scrum master's explicit instruction, only local transport timeout changed to 30 minutes per attempt; hosted stays 10 seconds. Extended baseline again used unchanged prompts/schema/default samplers. The main controlled rerun changes only benchmark HTTP temperature=0.2 and top_p=0.8, equally for both models. Context was preloaded to 4096 and checked via actual /api/ps and ollama ps. No unsupported v1 context parameter, model download, alias, global GPU setting, paid API or prompt truncation was introduced. Ollama documents v1 context configuration separately from request sampling: [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [context length and offloading](https://docs.ollama.com/context-length).

**Comparability limit:** inherited top-k is 20 for Qwen3 and 40 for Qwen2.5 (server sampler log); the installed OpenAI-compatible adapter does not support topK. Model templates/tokenizers and stop sequences also differ. Thus shared exposed sampling settings are controlled, but this is not a claim that every backend sampler is identical. Original defaults differ further (Qwen3 temperature .7/top-p .8; Qwen2.5 inherited server defaults). Prompts are never tuned per model. Each call is stateless, although Ollama's normal prefix cache is retained. Models run in separate blocks with no co-residency; cold versus warmed conditions are named. The controlled model order is fixed rather than randomized; thermal/background variation is a limitation.

Raw HTTP envelopes and parsed model JSON are captured before application validation. AJV checks exact serialized draft-07 JSON Schema; application Zod calendar/order/count refinements are scored separately. Absent expected fields, erroneous zeros and invented values count against extraction. Optional total is scored as completeness, not a required production-schema field. Whole-response failure scores no extraction credit; no token count is imputed. Model confidence is not a calibrated probability. The room-token metric is strict coverage over genuine room-intent test cases, including acceptable other-category clarifications; the separate model-declared-category contract metric distinguishes those from actual token-rule violations. The production prose-guard metric uses the application's validated category/prose, not the evaluator's expected label.

One evaluator reviewed every unique draft against the same 1–5 rubric (1 unusable/unsafe, 2 major rewrite, 3 staff editing, 4 minor edits, 5 excellent for staff review). Identical same-case prose shares a rating; repeated requests remain separate rows. Unsafe drafts always score 1. Guard acceptance is a separate deterministic metric; genuine guest budget repetition and benign refund acknowledgements can violate the guard without inventing a financial fact. Quality coverage is ${a.humanReviewCoverage}/${a.generatedDrafts} and ${b.humanReviewCoverage}/${b.generatedDrafts} in the primary comparison. Full rubric and ambiguity allowances: [protocol](../../tests/benchmarks/ollama/PROTOCOL.md).

**Actual live count: ${requests} chat-completion attempts**, including retries and one explicitly user-interrupted request; ${operations} completed logical enquiry operations across all conditions. Two-call experiments have two stages per successful extraction. Empty warmup/unload, metadata and resource polling are administrative HTTP requests, excluded from the generative count. The interrupted original controlled T10 request is separately recorded and has no invented output/rating.

| Evidence directory | Model | Completed enquiries | Chat attempts | Timeout enquiries | Attempts with unknown tokens |
|---|---|---:|---:|---:|---:|
${inventory.join("\n")}

All raw data: [evidence directory](ollama-benchmark/). Reproduction commands: [README](../../tests/benchmarks/ollama/README.md). Per-source hashes distinguish the timeout amendment from original code.

## 4. Model comparison scorecard

### Primary: extended timeout, shared exposed sampling, three full passes

${scorecard("extended-controlled")}

### Production-default sampling after the timeout amendment (one full pass)

${scorecard("extended-baseline")}

### Original untouched ten-second baseline (one full pass)

${scorecard("baseline")}

For the original 7B baseline, 0/30 operational schema/accuracy success means **no completed model response**: all requests timed out during loading. Completed-response-only schema, extraction and draft quality are unmeasured there; do not interpret these zeros as 30 malformed JSON outputs. All timeouts stay in operational denominators and latency statistics. The interrupted original controlled pass is retained in the complete matrix but excluded from primary like-for-like conclusions.

Primary extraction field detail:

${fieldTable}

## 5. Test definitions and detailed results

${casesTable}

Exact accepted field values, language alternatives and ambiguity reasoning live in the frozen synthetic fixtures. T10 permits preserved explicit past dates or omission/clarification; it does not permit silently changing an explicit year. T20 permits other or low-confidence unsorted handling. T22 permits genuine room intent or safe unsorted fallback. T25/T27 require uncertainty instead of guessing. Numeric guest counts and budgets are not inferred from disputed charges or room-price claims.

Every individual operation, including every repeated run and the old deadline failures, is appended at the end of this report and is also available in [test-matrix.md](ollama-benchmark/test-matrix.md). Raw extraction, summary, draft, literal token count, validation issues, fallback, usage, errors and request latency are in each runs.jsonl. Scored fields link back by evidence directory/model/case/run; separate runs are never blended into fictional responses.

## 6. Representative real model outputs

${examples.join("\n\n")}

## 7. Performance and resources

The original 7B ten-second attempts repeatedly canceled loading and reloaded on retry; server log explicitly records client connection closed before llama-server finished loading. That operational failure is preserved. The longer local deadline allowed the actual adapter to finish cold requests; inference remains slower with CPU offloading. Actual /api/ps shows Qwen3 loaded size=VRAM size 3180247121 bytes; 7B loaded size=5152041860 bytes with size_vram=4199263764 bytes. CLI reports 100% GPU versus 18%/82% CPU/GPU. Server logs show 25/29 7B layers offloaded, a 3616.41 MiB CUDA model buffer and 844.04 MiB host model buffer. No OOM crash was observed; memory reserve fitting selected CPU offload. GPU residency is not the same metric as utilization.

Resource traces are gpu-samples.csv and gpu-samples-extended.csv; timestamps permit alignment with each raw request. Sampling began after the first four original cases, so it is not complete first-request instrumentation. In primary active-request intervals, Qwen3 had 125 samples with median GPU utilization 95%, p95 96%, peak device memory use 3137 MiB; Qwen2.5 had 299 samples, median utilization 51%, p95 62%, peak memory 4113 MiB. These nvidia-smi values are whole-device samples, not isolated per-process attribution. Warmup files preserve their own latency and ps snapshot. Primary warm latency excludes empty preload time but includes all generation, SDK validation, retries and errors. Baseline includes its cold request. p95 is descriptive nearest-rank for n=90 per model, not a service SLA. Experiment n=12 medians are descriptive; no strong tail-latency claim is made. Unknown token usage on canceled requests is reported, not counted as measured zero. Largest reported prompt was ${audit.maxPromptTokens} tokens and largest completion ${audit.maxCompletionTokens}; even the full configured 1800-token output allowance leaves context headroom at 4096. The harness never truncates guest text.

## 8. Single-call versus two-call findings

Both production baselines are single-call. Meaningful date, ambiguity, perspective, quote and unsafe-prose failures justified an isolated 12-case experiment per model: T01,T05,T06,T09,T12,T14,T17,T19,T21,T22,T25,T27, covering room, wedding, offsite and complaint. Extraction uses the production classification schema plus optional preferences, no draft; drafting receives validated extraction and full redacted guest context, with explicit resort/category instructions. No database/routing code changes. Both calls use R1 and the shared exposed sampling/long local deadline. Latency and usage below sum both calls and all attempts. If extraction fails, drafting is skipped; a failed draft does not erase valid extraction. Current-single subset has three runs/case (n=36); each experimental condition has one (n=12), so conclusions are preliminary and token comparison uses measured per-enquiry means.

${comparison}

The improved-single control uses the same subset, production response schema and one call, adding explicit perspective, token placement, missing/invalid field, total and budget clarifications. Prompt changes confound any apparent two-call gain; comparison with this one-call control helps identify whether a second network call adds enough value. Token totals are measured, never assumed lower. ${editorial.architectureFindings}

## 9. Defects and improvement opportunities

${defects}

## 10. Final recommendation and production portability

${editorial.finalRecommendation}

The provider abstraction is structurally suitable for an eventual Anthropic Haiku switch: factory already selects the Anthropic SDK adapter, and classification/guard/pricing/routing remain server-owned. That is a code-inspection conclusion, not a hosted benchmark. Use an accessible account model ID and independently verify schema compatibility, cost, privacy and timeout behavior. Anthropic's [structured-output documentation](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) describes JSON Schema support and constraints; current local Zod refinements still require application validation. No paid call was made, and it is not established that a hosted API will eliminate all timeouts or quality issues. Hosted timeout remains short as requested.

## 11. Validation, boundaries and reproducibility

Required typecheck and full unit regression passed: **${units.numPassedTests} tests, zero failures**. Scoped ESLint and changed-source formatting passed. Original isolated fixture/mocked checks were 63/63; their original-timeout evidence is retained, while the full regression includes updated local/hosted timeout checks. [Validation commands/results](ollama-benchmark/validation.json), [unit results](ollama-benchmark/unit-regression.json), [evidence audit](ollama-benchmark/audit.json). Audit verifies all 387 completed operation keys, all 180 primary repeated cases, two-message independent requests, raw envelope/content identity, all started rerun requests accounted for, context headroom and complete generated-draft review. One Windows comma-argument experiment launch selected zero cases and generated no completions; it is preserved as empty-selection metadata and was rerun with the validated --subset selector. Machine account paths in metadata/test reports are redacted; raw model outputs are unchanged.

No database, schema, migration, inventory, pricing, booking, payment, UI, approval or sending path was changed or exercised against shared state. The **sole production behavior change is the explicitly authorized local provider timeout**, plus its tests and explanatory documentation. This supersedes the original assignment's blanket no-production-edit constraint only for that requested amendment. No other architectural change, commit, push, merge, deployment or model installation is part of the review. Work stops after reporting; proposed remedies require review.

## Appendix: every completed live operation

${matrix.replace(/^# Every live benchmark operation\n/, "")}
`;
if (requests !== audit.totalChatAttempts || report.includes("_PENDING"))
  throw new Error("Unresolved report evidence/editorial fields");
await writeFile("docs/reviews/r1-r4-ollama-model-benchmark.md", report);
console.log(
  JSON.stringify({
    report: "docs/reviews/r1-r4-ollama-model-benchmark.md",
    requests,
    operations,
    pendingEditorialFields: false,
  }),
);
