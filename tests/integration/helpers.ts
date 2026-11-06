import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";

export function testUrl(): string {
  const url =
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (or TEST_DATABASE_URL) for integration tests");
  return url;
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
