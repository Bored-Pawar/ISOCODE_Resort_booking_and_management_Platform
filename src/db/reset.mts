import postgres from "postgres";
import { assertSafeDestructiveTarget } from "@/db/safety";

/** DESTRUCTIVE: drops every table. Guarded by src/db/safety.ts. */
const { url, host } = assertSafeDestructiveTarget(process.env);

const sql = postgres(url, { max: 1, onnotice: () => {} });
await sql.unsafe(
  "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;",
);
await sql.end();
console.log(`Reset ${host}.`);
