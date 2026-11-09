/**
 * `pnpm db:deploy`: production migration and demo seed, run by hand once per new database.
 * Never run by CI or the build. See deployment.md.
 *
 *   ALLOW_PRODUCTION_SEED=yes PRODUCTION_DATABASE_URL_UNPOOLED="postgresql://..." pnpm db:deploy
 *   ... pnpm db:deploy --migrate-only      # schema changes on an existing production database
 *
 * The seed TRUNCATEs every table and loads the demo data (public demo passwords). Use it only on
 * an empty production database for the demo, never on one with real bookings.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { deployPlan } from "./db-deploy-plan";

// .env.local is read only to compare hosts; it never supplies the target.
const local = existsSync(".env.local") ? parseEnv(readFileSync(".env.local", "utf8")) : {};
let plan;
try {
  plan = deployPlan(process.env, process.argv.slice(2), local);
} catch (e) {
  console.error(e instanceof Error ? e.message : "Refusing.");
  process.exit(1);
}
console.log(`Target host: ${plan.hostFragment}`);
console.log(`Steps: ${plan.steps.join(", ")}`);
if (plan.steps.includes("seed"))
  console.log("The seed TRUNCATEs every table and loads demo data. Ctrl+C within 10 s to stop.");
await new Promise((r) => setTimeout(r, plan.steps.includes("seed") ? 10_000 : 3_000));

for (const step of plan.steps) {
  console.log(`\n== pnpm db:${step}`);
  const r = spawnSync("pnpm", [`db:${step}`], {
    env: plan.childEnv as NodeJS.ProcessEnv,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error(`db:${step} failed (exit ${r.status}). Stopped.`);
    process.exit(r.status ?? 1);
  }
}
console.log("\nDone.");
