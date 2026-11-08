import { readFile, readdir, writeFile } from "node:fs/promises";
import { percentile } from "./metrics";
const root = "docs/reviews/ollama-benchmark";
const samples: { time: number; memory: number; utilization: number; power: number }[] = [];
for (const f of (await readdir(root)).filter(
  (f) => f.startsWith("gpu-samples") && f.endsWith(".csv"),
)) {
  for (const line of (await readFile(`${root}/${f}`, "utf8"))
    .replace(/^\ufeff/, "")
    .trim()
    .split("\n")
    .slice(1)) {
    const [time, memory, utilization, power] = line.split(",");
    if (Number.isFinite(Date.parse(time)))
      samples.push({
        time: Date.parse(time),
        memory: Number(memory),
        utilization: Number(utilization),
        power: Number(power),
      });
  }
}
const results = [];
for (const d of await readdir(root, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  let rows: {
    model: string;
    rawResponses: { startedAt: string }[];
    metrics: { totalLatencyMs: number };
  }[];
  try {
    rows = (await readFile(`${root}/${d.name}/runs.jsonl`, "utf8"))
      .trim()
      .split("\n")
      .map((s) => JSON.parse(s));
  } catch {
    continue;
  }
  for (const model of [...new Set(rows.map((r) => r.model))]) {
    const intervals = rows
      .filter((r) => r.model === model)
      .map((r) => ({
        from: Date.parse(r.rawResponses[0].startedAt),
        duration: r.metrics.totalLatencyMs,
      }));
    const active = samples.filter((s) =>
      intervals.some((r) => s.time >= r.from && s.time <= r.from + r.duration),
    );
    results.push({
      evidence: d.name,
      model,
      samples: active.length,
      medianUtilizationPercent: percentile(
        active.map((s) => s.utilization),
        0.5,
      ),
      p95UtilizationPercent: percentile(
        active.map((s) => s.utilization),
        0.95,
      ),
      maxMemoryMiB: active.length ? Math.max(...active.map((s) => s.memory)) : null,
      medianMemoryMiB: percentile(
        active.map((s) => s.memory),
        0.5,
      ),
      medianPowerW: percentile(
        active.map((s) => s.power),
        0.5,
      ),
    });
  }
}
await writeFile(`${root}/resource-summary.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ groups: results.length, resourceSamples: samples.length }));
