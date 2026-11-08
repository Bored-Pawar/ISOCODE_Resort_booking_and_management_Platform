import { readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { cases } from "./cases";
import { evaluateExtraction, field, percentile, placeholderCount } from "./metrics";
import { safeModelDraft } from "../../../src/modules/ai-router/price-guard";

// Use the existing pinned dependency; no package installation or production dependency change.
const rootRequire = createRequire(import.meta.url);
const eslintRequire = createRequire(rootRequire.resolve("eslint"));
type Validator = ((v: unknown) => boolean) & { errors: unknown };
const Ajv = eslintRequire("ajv") as new (options: unknown) => {
  compile(schema: unknown): Validator;
};
const ajv = new Ajv({ allErrors: true, strictKeywords: false });
const root = "docs/reviews/ollama-benchmark";
type Json = Record<string, unknown>;
type Row = {
  suite: string;
  model: string;
  id: string;
  run: number;
  input: string;
  rawResponses: {
    stage?: string;
    schemaHash?: string;
    raw?: string;
    content?: string;
    parsed: unknown;
    usage: { prompt_tokens: number; completion_tokens: number } | null;
    validation: { success: boolean };
    status?: number;
    error?: string;
  }[];
  application: {
    status: string;
    classification: Json;
    draftText: string | null;
    response: { kind: string; error?: string; attempts: number };
    stages?: {
      extraction: { kind: string; error?: string };
      drafting?: { kind: string; error?: string };
    };
  };
  route: { lane: string; notifyGm: boolean };
  metrics: { totalLatencyMs: number; draftTemplateFallback: boolean };
  resourceAfter: {
    models: { name: string; size: number; size_vram: number; context_length: number }[];
  };
};
const humanPath = join(root, "human-reviews.json");
let human: Record<
  string,
  { quality: number; unsafe: boolean; perspective: string; notes: string }
> = {};
try {
  human = JSON.parse(await readFile(humanPath, "utf8"));
} catch {
  /* Evaluation can be filled after runs. */
}
const summaries = [];
const matrix: string[] = [
  "# Every live benchmark operation",
  "",
  "Wire = exact captured JSON Schema; Zod = production validation (experimental rows distinguish stages in raw evidence). Q = literal room quote compliance. Quality and unsafe labels are human review; — means no response/not reviewed. Latency includes retries/timeouts. Values are never imputed from another run.",
  "",
  "| Evidence | Model | Case/run | Application category/confidence | Dates | Adults/children/total | Budget/language | Wire/Zod | Guard/Q/template | Lane/GM alert | Quality/unsafe | ms | In/out tokens |",
  "|---|---|---|---|---|---|---|---|---|---|---|---:|---|",
];
const queue: {
  key: string;
  evidence: string;
  model: string;
  id: string;
  draft: string;
  extraction: unknown;
  input: string;
}[] = [];
const seen = new Set<string>();
for (const dir of (await readdir(root, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name))) {
  let rows: Row[];
  try {
    rows = (await readFile(join(root, dir.name, "runs.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((s) => JSON.parse(s));
  } catch {
    continue;
  }
  const firstRequest = JSON.parse(
    await readFile(join(root, dir.name, "first-request.json"), "utf8"),
  );
  const validate = ajv.compile(firstRequest.response_format.json_schema.schema);
  const validators = new Map<string, Validator>();
  try {
    for (const file of await readdir(join(root, dir.name, "schemas"))) {
      validators.set(
        file.replace(".json", ""),
        ajv.compile(JSON.parse(await readFile(join(root, dir.name, "schemas", file), "utf8"))),
      );
    }
  } catch {
    /* Initial untouched baseline has one captured schema. */
  }
  const measured = rows.map((row) => {
    const item = cases.find((c) => c.id === row.id)!;
    const raw =
      row.suite === "two-call"
        ? row.rawResponses.findLast((r) => r.stage === "extraction" && r.parsed)?.parsed
        : row.rawResponses.at(-1)?.parsed;
    const last = row.rawResponses.at(-1);
    const draft =
      row.suite === "two-call" && last?.stage !== "draft" ? null : field(last?.parsed, "draftText");
    const draftText = typeof draft === "string" ? draft : null;
    const key = createHash("sha256")
      .update(JSON.stringify([row.id, draftText]))
      .digest("hex")
      .slice(0, 20);
    if (draftText !== null && !human[key] && !seen.has(key)) {
      queue.push({
        key,
        evidence: dir.name,
        model: row.model,
        id: row.id,
        draft: draftText,
        extraction: raw,
        input: row.input,
      });
      seen.add(key);
    }
    const evaluation = human[key] ?? null;
    const requiredStages = row.suite === "two-call" ? ["extraction", "draft"] : ["single"];
    const wireStages = requiredStages.map((stage) => {
      const response = row.rawResponses.findLast((r) => (r.stage ?? "single") === stage);
      const validator = (response?.schemaHash && validators.get(response.schemaHash)) || validate;
      const success = !!response?.parsed && validator(response.parsed);
      return {
        stage,
        success,
        errors: success
          ? []
          : response?.parsed
            ? structuredClone(validator.errors)
            : ["No returned JSON"],
      };
    });
    const wireValid = wireStages.every((s) => s.success);
    const wireErrors = wireStages.filter((s) => !s.success);
    const zodFull =
      row.suite === "two-call"
        ? row.application.stages?.extraction.kind === "success" &&
          row.application.stages?.drafting?.kind === "success"
        : row.application.status === "ok";
    const categoryCorrect = item.expected.categories.includes(String(field(raw, "category")));
    const intentAcceptable =
      categoryCorrect ||
      (["T20", "T22"].includes(item.id) &&
        row.route.lane === "unsorted" &&
        (row.application.status === "fallback" || Number(field(raw, "confidence")) < 0.7));
    const extraction = evaluateExtraction(item, raw);
    const room = item.expected.categories.includes("room");
    const quoteCount = placeholderCount(draftText);
    const quoteCompliant = draftText !== null && quoteCount === (room ? 1 : 0);
    const normativeGuardPass = safeModelDraft(draftText, room);
    // The production guard uses the application's category and validated prose.
    const guardPass = !row.metrics.draftTemplateFallback;
    const quoteByModelCategory =
      draftText !== null &&
      raw !== null &&
      raw !== undefined &&
      quoteCount === (field(raw, "category") === "room" ? 1 : 0);
    const tokens = row.rawResponses.reduce(
      (acc, r) => ({
        input: acc.input + (r.usage?.prompt_tokens ?? 0),
        output: acc.output + (r.usage?.completion_tokens ?? 0),
        reported: acc.reported + (r.usage ? 1 : 0),
      }),
      { input: 0, output: 0, reported: 0 },
    );
    const metric = {
      ...row,
      evidence: dir.name,
      humanKey: key,
      evaluation,
      wireValid,
      wireErrors,
      zodFull,
      rawCategoryCorrect: categoryCorrect,
      intentAcceptable,
      extraction,
      guardPass,
      normativeGuardPass,
      quoteByModelCategory,
      quoteCompliant,
      quoteCount,
      tokens,
      raw,
      draftText,
    };
    const actual = row.application.classification;
    matrix.push(
      `| ${dir.name} | ${row.model} | ${row.id}/${row.run} | ${actual.category}/${actual.confidence} | ${field(actual, "dates.from") ?? "—"} → ${field(actual, "dates.to") ?? "—"} | ${["adults", "children", "total"].map((p) => field(actual, `guests.${p}`) ?? "—").join("/")} | ${field(actual, "budget.amountInr") ?? "—"}/${actual.language} | ${wireValid ? "pass" : "fail"}/${zodFull ? "pass" : (row.application.response.error ?? "stage failed")} | ${guardPass ? "pass" : "fail"}/${quoteCompliant ? "pass" : "fail"}/${row.metrics.draftTemplateFallback ? "yes" : "no"} | ${row.route.lane}/${row.route.notifyGm ? "yes" : "no"} | ${evaluation ? `${evaluation.quality}/${evaluation.unsafe ? "yes" : "no"}` : "—"} | ${Math.round(row.metrics.totalLatencyMs)} | ${tokens.reported ? `${tokens.input}/${tokens.output}` : "unknown"} |`,
    );
    return metric;
  });
  for (const model of [...new Set(rows.map((r) => r.model))]) {
    const group = measured.filter((r) => r.model === model);
    const count = group.length;
    const rate = (n: number, d = count) => ({ n, d, rate: d ? n / d : null });
    const generated = group.filter((r) => r.draftText !== null);
    const evaluated = group.filter((r) => r.evaluation !== null);
    const fields = group.flatMap((r) => r.extraction);
    const reported = group.reduce((n, r) => n + r.tokens.reported, 0);
    const httpRequests = group.reduce((n, r) => n + r.rawResponses.length, 0);
    const summary = {
      evidence: dir.name,
      model,
      operations: count,
      httpRequests,
      rawClassification: rate(group.filter((r) => r.rawCategoryCorrect).length),
      validatedClassification: rate(
        group.filter((r) => r.rawCategoryCorrect && r.application.status === "ok").length,
      ),
      applicationCategory: rate(
        group.filter((r) =>
          cases
            .find((c) => c.id === r.id)!
            .expected.categories.includes(String(r.application.classification.category)),
        ).length,
      ),
      acceptableIntent: rate(group.filter((r) => r.intentAcceptable).length),
      complaintPriority: rate(
        group.filter(
          (r) =>
            cases.find((c) => c.id === r.id)!.expected.categories.includes("complaint") &&
            r.application.classification.category === "complaint" &&
            r.route.notifyGm,
        ).length,
        group.filter((r) =>
          cases.find((c) => c.id === r.id)!.expected.categories.includes("complaint"),
        ).length,
      ),
      ambiguityUnsorted: rate(
        group.filter(
          (r) =>
            cases.find((c) => c.id === r.id)!.expected.lowConfidence && r.route.lane === "unsorted",
        ).length,
        group.filter((r) => cases.find((c) => c.id === r.id)!.expected.lowConfidence).length,
      ),
      wireSchema: rate(group.filter((r) => r.wireValid).length),
      zodSchema: rate(group.filter((r) => r.zodFull).length),
      extractionZodSchema: rate(group.filter((r) => r.application.status === "ok").length),
      extraction: rate(fields.filter((f) => f.correct).length, fields.length),
      extractionByField: Object.fromEntries(
        [...new Set(fields.map((f) => f.path))].map((p) => {
          const f = fields.filter((v) => v.path === p);
          return [p, rate(f.filter((v) => v.correct).length, f.length)];
        }),
      ),
      guardSafety: rate(group.filter((r) => r.guardPass).length),
      guardAmongGenerated: rate(generated.filter((r) => r.guardPass).length, generated.length),
      normativeRawGuard: rate(group.filter((r) => r.normativeGuardPass).length),
      unsafeAcceptedByGuard: group.filter((r) => r.evaluation?.unsafe && r.guardPass).length,
      quoteByModelCategory: rate(group.filter((r) => r.quoteByModelCategory).length),
      quoteAll: rate(group.filter((r) => r.quoteCompliant).length),
      quoteRoom: rate(
        group.filter(
          (r) =>
            cases.find((c) => c.id === r.id)!.expected.categories.includes("room") &&
            r.quoteCompliant,
        ).length,
        group.filter((r) => cases.find((c) => c.id === r.id)!.expected.categories.includes("room"))
          .length,
      ),
      fallback: rate(group.filter((r) => r.application.status !== "ok").length),
      templateFallback: rate(group.filter((r) => r.metrics.draftTemplateFallback).length),
      unsorted: rate(group.filter((r) => r.route.lane === "unsorted").length),
      timeouts: group.filter(
        (r) =>
          r.application.response.error === "TIMEOUT" ||
          r.application.stages?.drafting?.error === "TIMEOUT",
      ).length,
      errors: group
        .filter((r) => r.application.response.kind === "error")
        .map((r) => ({ id: r.id, run: r.run, error: r.application.response.error })),
      medianLatencyMs: percentile(
        group.map((r) => r.metrics.totalLatencyMs),
        0.5,
      ),
      p95LatencyMs: percentile(
        group.map((r) => r.metrics.totalLatencyMs),
        0.95,
      ),
      minLatencyMs: Math.min(...group.map((r) => r.metrics.totalLatencyMs)),
      maxLatencyMs: Math.max(...group.map((r) => r.metrics.totalLatencyMs)),
      tokens: {
        input: group.reduce((n, r) => n + r.tokens.input, 0),
        output: group.reduce((n, r) => n + r.tokens.output, 0),
        reportedRequests: reported,
        unknownRequests: httpRequests - reported,
      },
      humanReviewCoverage: evaluated.length,
      generatedDrafts: generated.length,
      humanUnsafe: evaluated.filter((r) => r.evaluation!.unsafe).length,
      humanQualityMean: evaluated.length
        ? evaluated.reduce((n, r) => n + r.evaluation!.quality, 0) / evaluated.length
        : null,
      resourceSamples: [
        ...new Map(
          group
            .flatMap((r) => r.resourceAfter.models)
            .map(({ name, size, size_vram, context_length }) => {
              const m = { name, size, size_vram, context_length };
              return [JSON.stringify(m), m] as const;
            }),
        ).values(),
      ],
    };
    summaries.push(summary);
  }
  await writeFile(
    join(root, dir.name, "scored.json"),
    JSON.stringify(
      measured.map(
        ({
          id,
          run,
          model,
          evidence,
          humanKey,
          evaluation,
          wireValid,
          wireErrors,
          rawCategoryCorrect,
          intentAcceptable,
          extraction,
          guardPass,
          quoteCompliant,
          quoteCount,
          tokens,
        }) => ({
          id,
          run,
          model,
          evidence,
          humanKey,
          evaluation,
          wireValid,
          wireErrors,
          rawCategoryCorrect,
          intentAcceptable,
          extraction,
          guardPass,
          quoteCompliant,
          quoteCount,
          tokens,
        }),
      ),
      null,
      2,
    ),
  );
}
await writeFile(join(root, "summary.json"), JSON.stringify(summaries, null, 2));
await writeFile(join(root, "test-matrix.md"), matrix.join("\n") + "\n");
await writeFile(join(root, "review-queue.json"), JSON.stringify(queue, null, 2));
console.log(
  JSON.stringify({
    operations: summaries.reduce((n, s) => n + s.operations, 0),
    requests: summaries.reduce((n, s) => n + s.httpRequests, 0),
    groups: summaries.length,
    pendingHumanReviews: queue.length,
  }),
);
