import { readFile, writeFile } from "node:fs/promises";
import { cases } from "./cases";
import { percentile } from "./metrics";
const root = "docs/reviews/ollama-benchmark";
const selected = new Set([
  "T01",
  "T05",
  "T06",
  "T09",
  "T12",
  "T14",
  "T17",
  "T19",
  "T21",
  "T22",
  "T25",
  "T27",
]);
type Row = {
  model: string;
  id: string;
  run: number;
  application: { status: string };
  metrics: { totalLatencyMs: number };
};
type Scored = {
  model: string;
  id: string;
  run: number;
  rawCategoryCorrect: boolean;
  extraction: { correct: boolean }[];
  evaluation: { quality: number; unsafe: boolean } | null;
  quoteCompliant: boolean;
  tokens: { input: number; output: number };
};
const results = [];
for (const evidence of ["extended-controlled", "two-call", "improved-single"]) {
  const rows: Row[] = (await readFile(`${root}/${evidence}/runs.jsonl`, "utf8"))
    .trim()
    .split("\n")
    .map((s) => JSON.parse(s));
  const scores: Scored[] = JSON.parse(await readFile(`${root}/${evidence}/scored.json`, "utf8"));
  for (const model of ["qwen3:4b-instruct", "qwen2.5:7b"]) {
    const group = rows.filter((r) => r.model === model && selected.has(r.id));
    const scored = scores.filter((r) => r.model === model && selected.has(r.id));
    const evaluated = scored.filter((s) => s.evaluation !== null);
    const fields = scored.flatMap((s) => s.extraction);
    const room = scored.filter((s) =>
      cases.find((c) => c.id === s.id)!.expected.categories.includes("room"),
    );
    results.push({
      evidence,
      model,
      n: group.length,
      correctValidated: group.filter(
        (r) =>
          r.application.status === "ok" &&
          scored.find((s) => s.id === r.id && s.run === r.run)!.rawCategoryCorrect,
      ).length,
      fieldCorrect: fields.filter((s) => s.correct).length,
      fieldCount: fields.length,
      quality: evaluated.length
        ? evaluated.reduce((n, s) => n + s.evaluation!.quality, 0) / evaluated.length
        : null,
      generated: evaluated.length,
      unsafe: evaluated.filter((s) => s.evaluation!.unsafe).length,
      quoteCorrect: room.filter((s) => s.quoteCompliant).length,
      quoteCount: room.length,
      medianMs: percentile(
        group.map((r) => r.metrics.totalLatencyMs),
        0.5,
      ),
      input: scored.reduce((n, s) => n + s.tokens.input, 0),
      output: scored.reduce((n, s) => n + s.tokens.output, 0),
    });
  }
}
await writeFile(`${root}/architecture-comparison.json`, JSON.stringify(results, null, 2));
