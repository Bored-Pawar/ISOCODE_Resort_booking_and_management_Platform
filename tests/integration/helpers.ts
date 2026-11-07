import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { assertSafeDestructiveTarget } from "@/db/safety";

let cachedUrl: string | undefined;

/**
 * The only database integration tests may write to: TEST_DATABASE_URL, no fallback.
 * Validated once (before any test mutates process.env) and then cached.
 */
export function testUrl(): string {
  cachedUrl ??= assertSafeDestructiveTarget({ ...process.env, DB_TARGET: "test" }).url;
  return cachedUrl;
}
export function connect() {
  return postgres(testUrl(), { max: 4, prepare: false, onnotice: () => {} });
}

export async function ensureMigrated(sql: ReturnType<typeof connect>) {
  await migrate(drizzle(sql), { migrationsFolder: "./src/db/migrations" });
}

class Rollback extends Error {}

/** Runs fn in a transaction and always rolls back, so tests leave no data behind. */
export async function inRollback<T>(
  sql: ReturnType<typeof connect>,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
) {
  let out: T | undefined;
  try {
    await sql.begin(async (tx) => {
      out = await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return out as T;
}
