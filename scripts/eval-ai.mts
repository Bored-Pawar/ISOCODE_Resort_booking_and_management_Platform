import { mkdir, writeFile } from "node:fs/promises";
import { labelledEnquiries } from "../src/db/seed/enquiries.data";
import { classifyMessage } from "../src/modules/ai-router/classify";
import { selectProvider } from "../src/modules/ai-provider";
import { safeModelDraft } from "../src/modules/ai-router/price-guard";
import { route } from "../src/modules/ai-router/routing";
import { PROMPT_VERSION } from "../src/modules/ai-router/prompts";

const smoke = process.argv.includes("--smoke");
const selection = selectProvider();
const model = selection.kind === "rules-only" ? null : selection.modelId;
const cases = smoke
  ? [
      labelledEnquiries[0],
      labelledEnquiries[1],
      labelledEnquiries[2],
      labelledEnquiries[20],
      labelledEnquiries[28],
    ]
  : labelledEnquiries;
const rows: {
  id: string;
  expected: string;
  actual: string;
  status: string;
  correct: boolean;
  safeDraft: boolean;
  unsorted: boolean;
  latencyMs: number;
  rateLimits: number;
  error: string | null;
}[] = [];
if (selection.kind !== "error")
  for (let i = 0; i < cases.length; i++) {
    const item = cases[i];
    const r = await classifyMessage({
      rawText: item.text,
      senderName: item.name,
      senderContact: item.contact,
      receivedAt: new Date("2026-11-08T12:00:00+05:30"),
    });
    rows.push({
      id: item.id,
      expected: item.label,
      actual: r.classification.category,
      status: r.status,
      correct: r.classification.category === item.label,
      safeDraft: safeModelDraft(r.draftText, r.classification.category === "room"),
      unsorted: route(r.classification, r.status).lane === "unsorted",
      latencyMs: r.response.latencyMs,
      rateLimits: r.response.rateLimits,
      error: r.response.kind === "error" ? r.response.error : null,
    });
    if (selection.kind === "model" && i + 1 < cases.length)
      await new Promise((resolve) => setTimeout(resolve, 4500));
  }
const live = selection.kind === "model";
const measured = rows.filter((r) => !r.error || r.error === "INVALID_RESPONSE");
const parsed = rows.filter((r) => r.status === "ok");
const latencies = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
const rate = (numerator: number, denominator: number) =>
  denominator ? numerator / denominator : null;
const confusion: Record<string, Record<string, number>> = {};
for (const row of parsed) {
  confusion[row.expected] ??= {};
  confusion[row.expected][row.actual] = (confusion[row.expected][row.actual] ?? 0) + 1;
}
const report = {
  generatedAt: new Date().toISOString(),
  mode: live ? "live-model" : selection.kind === "rules-only" ? "rules-only" : "not-configured",
  provider: selection.provider,
  model,
  promptVersion: PROMPT_VERSION,
  smoke,
  syntheticOnly: true,
  databaseWrites: false,
  requestedCases: cases.length,
  attemptedCases: rows.length,
  structuredSuccesses: parsed.length,
  accuracyDenominator: live ? measured.length : 0,
  modelAccuracy: live ? rate(parsed.filter((r) => r.correct).length, measured.length) : null,
  rulesAccuracy:
    !live && rows.length ? rate(rows.filter((r) => r.correct).length, rows.length) : null,
  schemaValidity: live ? rate(parsed.length, measured.length) : null,
  safeModelDraftRate: live ? rate(parsed.filter((r) => r.safeDraft).length, parsed.length) : null,
  fallbackRate: rate(rows.filter((r) => r.status === "fallback").length, rows.length),
  unsortedRate: rate(rows.filter((r) => r.unsorted).length, rows.length),
  http429Responses: rows.reduce((n, r) => n + r.rateLimits, 0),
  timeouts: rows.filter((r) => r.error === "TIMEOUT").length,
  availabilityFailures: rows.filter((r) => r.error && r.error !== "INVALID_RESPONSE").length,
  medianLatencyMs: live && latencies.length ? latencies[Math.floor(latencies.length / 2)] : null,
  p95LatencyMs: live && latencies.length ? latencies[Math.ceil(latencies.length * 0.95) - 1] : null,
  confusion,
  rows,
};
await mkdir("docs/evidence", { recursive: true });
const path = `docs/evidence/ai-${smoke ? "smoke" : "evaluation"}-${report.mode}.json`;
await writeFile(path, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ report: path, ...report, rows: undefined }));
