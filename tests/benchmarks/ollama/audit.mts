import { readFile, readdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const root = "docs/reviews/ollama-benchmark";
type Response = {
  raw?: string;
  content?: string;
  usage?: { prompt_tokens: number; completion_tokens: number } | null;
  prompt: { role: string; content: unknown }[];
};
type Row = { id: string; run: number; model: string; rawResponses: Response[] };
let operations = 0,
  requests = 0,
  maxPromptTokens = 0,
  maxCompletionTokens = 0,
  returnedEnvelopes = 0;
const counts = [];
for (const dir of await readdir(root, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  let rows: Row[];
  try {
    rows = (await readFile(`${root}/${dir.name}/runs.jsonl`, "utf8"))
      .trim()
      .split("\n")
      .map((s) => JSON.parse(s));
  } catch {
    continue;
  }
  const keys = rows.map((r) => `${r.model}/${r.id}/${r.run}`);
  assert.equal(new Set(keys).size, rows.length, `Duplicate operation in ${dir.name}`);
  const http = rows.reduce((n, r) => n + r.rawResponses.length, 0);
  if (dir.name !== "controlled") {
    const completed = JSON.parse(await readFile(`${root}/${dir.name}/completed.json`, "utf8"));
    assert.equal(completed.adapterOperations, rows.length);
    assert.equal(completed.httpRequests, http);
  }
  if (dir.name.startsWith("extended-") || ["two-call", "improved-single"].includes(dir.name)) {
    const starts = (await readFile(`${root}/${dir.name}/request-starts.jsonl`, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean);
    assert.equal(starts.length, http, `Unsettled request in ${dir.name}`);
  }
  if (dir.name === "extended-controlled") {
    assert.equal(rows.length, 180);
    for (const model of ["qwen3:4b-instruct", "qwen2.5:7b"])
      for (const run of [1, 2, 3])
        assert.equal(rows.filter((r) => r.model === model && r.run === run).length, 30);
  }
  for (const row of rows)
    for (const response of row.rawResponses) {
      assert.equal(response.prompt.length, 2, "Unexpected conversation history");
      if (response.raw) {
        const envelope = JSON.parse(response.raw);
        if (envelope.choices?.[0]?.message) {
          assert.equal(envelope.choices[0].message.content, response.content);
          returnedEnvelopes++;
        }
      }
      maxPromptTokens = Math.max(maxPromptTokens, response.usage?.prompt_tokens ?? 0);
      maxCompletionTokens = Math.max(maxCompletionTokens, response.usage?.completion_tokens ?? 0);
    }
  operations += rows.length;
  requests += http;
  counts.push({ evidence: dir.name, operations: rows.length, chatAttempts: http });
}
assert.equal(operations, 387);
assert.equal(requests, 438);
assert.equal(
  (JSON.parse(await readFile(`${root}/review-queue.json`, "utf8")) as unknown[]).length,
  0,
);
assert.ok(maxPromptTokens + 1800 <= 4096, "Insufficient headroom for full configured output cap");
const interrupted = JSON.parse(await readFile(`${root}/controlled/interrupted.json`, "utf8"));
const result = {
  passed: true,
  operations,
  recordedChatAttempts: requests,
  interruptedUnrecordedChatAttempts: interrupted.unrecordedInterruptedChatAttempts,
  totalChatAttempts: requests + interrupted.unrecordedInterruptedChatAttempts,
  returnedEnvelopes,
  maxPromptTokens,
  maxCompletionTokens,
  configuredContext: 4096,
  configuredOutputCap: 1800,
  contextHeadroomVerified: true,
  rawEnvelopeContentIdentityVerified: true,
  independentTwoMessageRequestsVerified: true,
  primaryThreeFullPassesVerified: true,
  allStartedRerunRequestsAccountedFor: true,
  allGeneratedDraftsReviewed: true,
  counts,
};
await writeFile(`${root}/audit.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
