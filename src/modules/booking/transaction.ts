/** Internal rollback carrier: business failures must undo even the initial lazy expiry. */
export class RollbackResult<T> extends Error {
  constructor(readonly result: T) {
    super("Rollback business result");
  }
}

export function postgresCode(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    const e = error as { code?: string; cause?: unknown };
    if (e.code) return e.code;
    error = e.cause;
  }
}

export function isTransactionConflict(error: unknown): boolean {
  return ["40P01", "40001"].includes(postgresCode(error) ?? "");
}

export function holdMinutes(): number {
  const value = Number(process.env.HOLD_MINUTES ?? "10");
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error("HOLD_MINUTES must be a positive integer");
  return value;
}
