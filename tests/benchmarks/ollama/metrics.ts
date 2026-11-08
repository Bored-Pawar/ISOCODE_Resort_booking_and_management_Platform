import { cases, type BenchmarkCase } from "./cases";

export function chooseCases(ids: string[]): BenchmarkCase[] {
  if (!ids.length) return cases;
  if (new Set(ids).size !== ids.length || ids.some((id) => !cases.some((c) => c.id === id)))
    throw new Error("Unknown or duplicate case IDs; refusing an empty/partial benchmark selection");
  return cases.filter((c) => ids.includes(c.id));
}

export function field(value: unknown, path: string): unknown {
  return (
    path
      .split(".")
      .reduce<unknown>(
        (v, key) => (v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined),
        value,
      ) ?? null
  );
}
export function evaluateExtraction(item: BenchmarkCase, value: unknown) {
  return Object.entries(item.expected.fields).map(([path, accepted]) => ({
    path,
    actual: field(value, path),
    accepted,
    correct:
      value !== null &&
      value !== undefined &&
      accepted.includes(field(value, path) as string | number | null),
  }));
}
export function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (fraction === 0.5)
    return (
      (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2
    );
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}
export function placeholderCount(value: unknown) {
  return typeof value === "string" ? (value.match(/\{\{QUOTE\}\}/g) ?? []).length : 0;
}
