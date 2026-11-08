/** Deterministic replay of saved synthetic model prose: no env loading, inference or database. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { safeModelDraft as before } from "./guard-baseline";
import { safeModelDraft as after } from "../../../src/modules/ai-router/price-guard";
import { groundExtraction } from "../../../src/modules/ai-router/grounding";
import { cases } from "./cases";
type Row = {
  model: string;
  id: string;
  run: number;
  application: {
    classification: Parameters<typeof groundExtraction>[1];
    draftText: string | null;
    status: string;
  };
};
const groups = [];
const rows = [];
const inputs = [];
for (const suite of ["extended-baseline", "extended-controlled"]) {
  const path = `docs/reviews/ollama-benchmark/${suite}/runs.jsonl`;
  const source = await readFile(path, "utf8");
  inputs.push({ path, sha256: createHash("sha256").update(source).digest("hex") });
  const saved: Row[] = source
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  for (const model of [...new Set(saved.map((r) => r.model))]) {
    const selected = saved.filter((r) => r.model === model);
    if (new Set(selected.map((r) => r.id)).size !== 30)
      throw new Error("Expected all 30 immutable seeds");
    const results = selected.map((row) => {
      const raw = cases.find((c) => c.id === row.id)!.text;
      const c = row.application.classification;
      const draft = row.application.draftText;
      const context = { rawText: raw, evidence: groundExtraction(raw, c, "2026-11-08") };
      return {
        suite,
        model,
        id: row.id,
        run: row.run,
        category: c.category,
        draft,
        beforeAccepted: before(draft, c.category === "room"),
        afterAccepted: after(draft, c.category === "room", context),
        grounding: context.evidence.grounding,
      };
    });
    rows.push(...results);
    const old = results.filter((r) => !r.beforeAccepted).length;
    const changed = results.filter((r) => !r.afterAccepted).length;
    groups.push({
      suite,
      model,
      cases: 30,
      samples: results.length,
      beforeFallback: old,
      afterFallback: changed,
      beforeRate: old / results.length,
      afterRate: changed / results.length,
      changePercentagePoints: ((changed - old) / results.length) * 100,
    });
  }
}
const output = {
  mode: "saved-output replay, no fresh model inference",
  referenceDateIST: "2026-11-08",
  inputs,
  groups,
  rows,
};
await writeFile(
  "docs/reviews/r1-r4-draft-guard-replay.json",
  JSON.stringify(output, null, 2) + "\n",
);
console.log(JSON.stringify(groups, null, 2));
