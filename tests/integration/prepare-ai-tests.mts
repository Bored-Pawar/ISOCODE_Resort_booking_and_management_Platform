/** Test-only bootstrap: the existing guard selects TEST_DATABASE_URL, never development. */
import { connect, ensureMigrated } from "./helpers";
const client = connect();
try {
  if (process.argv.includes("--check")) {
    const [counts] = await client`SELECT
      (SELECT count(*)::int FROM enquiries) AS enquiries,
      (SELECT count(*)::int FROM reply_drafts) AS drafts,
      (SELECT count(*)::int FROM enquiry_events) AS events,
      (SELECT count(*)::int FROM notifications) AS notifications,
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM room_types) AS rooms,
      (SELECT count(*)::int FROM tax_slabs) AS tax_slabs`;
    console.log(JSON.stringify({ mode: "guarded-test-read-only", ...counts }));
  } else {
    await ensureMigrated(client);
    console.log("Existing migrations applied to guarded TEST_DATABASE_URL. No seed/reset run.");
  }
} finally {
  await client.end();
}
