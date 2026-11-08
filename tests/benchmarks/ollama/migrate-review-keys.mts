import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = "docs/reviews/ollama-benchmark";
const reviews = JSON.parse(await readFile(`${root}/human-reviews.json`, "utf8"));
const migrated: Record<string, unknown> = {};
for (const d of await readdir(root, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  let lines: string[];
  try {
    lines = (await readFile(`${root}/${d.name}/runs.jsonl`, "utf8")).trim().split("\n");
  } catch {
    continue;
  }
  for (const line of lines) {
    const row = JSON.parse(line);
    const raw =
      row.suite === "two-call"
        ? row.rawResponses.findLast(
            (r: { stage: string; parsed: unknown }) => r.stage === "extraction" && r.parsed,
          )?.parsed
        : row.rawResponses.at(-1)?.parsed;
    const draft = row.rawResponses.at(-1)?.parsed?.draftText;
    if (typeof draft !== "string") continue;
    const oldKey = createHash("sha256")
      .update(JSON.stringify([row.id, draft, raw]))
      .digest("hex")
      .slice(0, 20);
    const newKey = createHash("sha256")
      .update(JSON.stringify([row.id, draft]))
      .digest("hex")
      .slice(0, 20);
    if (reviews[oldKey] || reviews[newKey]) migrated[newKey] = reviews[oldKey] || reviews[newKey];
  }
}
await writeFile(`${root}/human-reviews.json`, JSON.stringify(migrated, null, 2));
