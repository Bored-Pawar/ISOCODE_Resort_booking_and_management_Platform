import postgres from "postgres";

/** DESTRUCTIVE: drops every table. Development databases only. */
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required");
if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset in production");

const host = new URL(url).hostname;
const protectedHosts = (process.env.DB_PROTECTED_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);
if (protectedHosts.some((h) => host.includes(h))) {
  throw new Error(`Refusing to reset protected host ${host}`);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
await sql.unsafe(
  "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;",
);
await sql.end();
console.log(`Reset ${host}.`);
