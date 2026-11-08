import { assertSafeDestructiveTarget } from "../src/db/safety";
import postgres from "postgres";

const target = assertSafeDestructiveTarget({ ...process.env, DB_TARGET: "test" });
const sql = postgres(target.url, { max: 1, prepare: false });
try {
  if (process.argv.includes("--activity")) {
    console.log(
      JSON.stringify(
        await sql`select effective_from, min_paise, max_paise, count(*)::int as copies
      from tax_slabs group by effective_from, min_paise, max_paise having count(*) > 1`,
      ),
    );
    console.log(
      JSON.stringify(
        await sql`select state, wait_event_type, wait_event, count(*)::int as connections,
      max(extract(epoch from clock_timestamp() - query_start))::int as longest_query_seconds
      from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()
      group by state, wait_event_type, wait_event`,
      ),
    );
  }
  const [row] = await sql`select current_database() as database, version() as version,
    (select count(*)::int from information_schema.tables where table_schema = 'public') as tables`;
  console.log(
    JSON.stringify({
      mode: target.mode,
      isolated: true,
      ...row,
      providers: {
        google: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
        localConfigured: Boolean(process.env.LOCAL_AI_BASE_URL),
        selected: process.env.AI_PROVIDER ?? "rules",
        model: process.env.AI_MODEL || null,
      },
    }),
  );
} finally {
  await sql.end();
}
