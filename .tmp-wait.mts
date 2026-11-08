import postgres from "postgres";
process.loadEnvFile(".env.local");
const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
for (let i = 0; i < 90; i++) {
  const rows = await sql`SELECT state, extract(epoch from now()-coalesce(state_change, query_start))::int AS idle FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend'`;
  const busy = rows.filter((r) => r.state !== "idle" || r.idle < 120);
  if (busy.length === 0) { console.log("QUIET after", i, "polls"); break; }
  await new Promise((r) => setTimeout(r, 20000));
}
const slabs = await sql`SELECT count(*)::int n FROM tax_slabs WHERE effective_from = '2099-01-01'`;
console.log("2099 slabs", slabs[0].n);
await sql.end();
