/** Redact machine account paths from metadata/test reports; raw model responses remain untouched. */
import { readFile, readdir, writeFile } from "node:fs/promises";
const root = "docs/reviews/ollama-benchmark";
const profile = process.env.USERPROFILE ?? "";
const variants = profile ? [profile, profile.replaceAll("\\", "/")] : [];
function scrub(value: unknown): unknown {
  if (typeof value === "string")
    return variants.reduce((s, path) => s.split(path).join("[USERPROFILE]"), value);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]));
  return value;
}
const files = [`${root}/isolated-checks.json`, `${root}/unit-regression.json`];
const loadingLog = `${root}/loading-log-excerpt.txt`;
await writeFile(
  loadingLog,
  (await readFile(loadingLog, "utf8")).replace(
    /[a-z]:\\{1,2}Users\\{1,2}[^\\"]+/gi,
    "[USERPROFILE]",
  ),
);
for (const d of await readdir(root, { withFileTypes: true }))
  if (d.isDirectory())
    for (const f of await readdir(`${root}/${d.name}`))
      if (f.endsWith("environment.json")) files.push(`${root}/${d.name}/${f}`);
for (const file of files) {
  const value = scrub(JSON.parse(await readFile(file, "utf8"))) as Record<string, unknown>;
  value.machineAccountPathRedacted = true;
  await writeFile(file, JSON.stringify(value, null, 2));
}
console.log(
  JSON.stringify({ metadataFilesRedacted: files.length, rawModelResponsesModified: false }),
);
