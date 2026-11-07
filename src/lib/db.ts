import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

export type Db = ReturnType<typeof createDb>["db"];
/** A transaction handle, passed between modules as `tx` for coordinated writes. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function createDb(url: string, opts: { max?: number } = {}) {
  // prepare:false keeps us compatible with Neon's pooled (pgbouncer) endpoint.
  const client = postgres(url, { prepare: false, max: opts.max ?? 5, onnotice: () => {} });
  return { db: drizzle(client, { schema }), client };
}

let cached: ReturnType<typeof createDb> | undefined;

/** Lazily created app-wide client. Reads DATABASE_URL on first use. */
export function getDb(): Db {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    cached = createDb(url);
  }
  return cached.db;
}
