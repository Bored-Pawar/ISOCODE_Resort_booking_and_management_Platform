import { migrate } from "drizzle-orm/postgres-js/migrator";
import { assertSafeDestructiveTarget } from "@/db/safety";
import { createDb } from "@/lib/db";

// Same target as db:reset and db:seed: DATABASE_URL_UNPOOLED, or TEST_DATABASE_URL when DB_TARGET=test.
// No fallback. A production deploy needs its own explicit migration step (F6).
const { url } = assertSafeDestructiveTarget(process.env);

const { db, client } = createDb(url, { max: 1 });
await migrate(db, { migrationsFolder: "./src/db/migrations" });
await client.end();
console.log("Migrations applied.");
