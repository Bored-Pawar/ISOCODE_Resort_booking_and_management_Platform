/**
 * What may be logged about a caught error: its class name and, for PostgreSQL, the SQLSTATE.
 * Never the message or the object: drizzle's "Failed query ... params:" message carries bound
 * values (reply bodies, contacts, notes), and SDK errors can echo request bodies.
 */
export function safeError(error: unknown): { name: string; code?: string } {
  const name = error instanceof Error ? error.name : "unknown";
  const e = error as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = [e?.cause?.code, e?.code].find(
    (c): c is string => typeof c === "string" && /^[0-9A-Z]{5}$/.test(c),
  );
  return code ? { name, code } : { name };
}
