import { sql } from "drizzle-orm";

/** Database clock expression; separate dependency permits deterministic SQL boundary tests. */
export function confirmationClock() {
  return sql`clock_timestamp()`;
}
