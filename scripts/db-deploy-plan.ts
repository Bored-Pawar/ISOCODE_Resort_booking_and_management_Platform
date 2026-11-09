/**
 * Pure decision for `pnpm db:deploy` (production migration and demo seed). Takes an env object
 * and returns what will run against which host, or throws. Never reads `.env.local`: the target
 * comes only from PRODUCTION_DATABASE_URL_UNPOOLED, set explicitly in the shell.
 */
export type DeployPlan = {
  host: string;
  /** Printed before anything runs: first label of the host plus the region part. */
  hostFragment: string;
  steps: ("migrate" | "seed")[];
  /** Env for the child processes (`pnpm db:migrate`, `pnpm db:seed`). */
  childEnv: Record<string, string | undefined>;
};

export function deployPlan(
  env: Record<string, string | undefined>,
  argv: readonly string[] = [],
  /** `.env.local`, read only to refuse a target that is the dev or test database. */
  local: Record<string, string | undefined> = {},
): DeployPlan {
  if (env.ALLOW_PRODUCTION_SEED !== "yes")
    throw new Error("Refusing: set ALLOW_PRODUCTION_SEED=yes to run against production.");
  const url = env.PRODUCTION_DATABASE_URL_UNPOOLED?.trim();
  if (!url) throw new Error("Refusing: PRODUCTION_DATABASE_URL_UNPOOLED is not set.");
  let host: string;
  try {
    const u = new URL(url);
    if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error("bad protocol");
    host = u.hostname.toLowerCase();
  } catch {
    throw new Error("Refusing: PRODUCTION_DATABASE_URL_UNPOOLED is not a postgres URL.");
  }
  if (!host) throw new Error("Refusing: the production URL has no host.");
  if (/-pooler(\.|$)/.test(host))
    throw new Error("Refusing: use the direct (unpooled) connection string for migrations.");
  for (const [name, other] of [
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "TEST_DATABASE_URL",
  ].flatMap((n) => [env[n], local[n]].map((v) => [n, v?.trim()] as const))) {
    if (!other) continue;
    try {
      if (new URL(other).hostname.toLowerCase().replace(/-pooler(?=\.|$)/, "") === host)
        throw new Error(`Refusing: the production URL is the same database as ${name}.`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Refusing")) throw e;
    }
  }
  const labels = host.split(".");
  const hostFragment = `${labels[0]} (${labels.slice(1, -2).join(".") || "?"})`;
  const steps: DeployPlan["steps"] = argv.includes("--migrate-only")
    ? ["migrate"]
    : ["migrate", "seed"];
  return {
    host,
    hostFragment,
    steps,
    childEnv: {
      ...env,
      // The existing guarded scripts target DATABASE_URL_UNPOOLED in dev mode. Setting every
      // variable explicitly means `--env-file-if-exists=.env.local` in those scripts cannot
      // override the target (Node never overwrites a variable that is already set).
      DATABASE_URL: url,
      DATABASE_URL_UNPOOLED: url,
      DB_TARGET: "",
      TEST_DATABASE_URL: "",
      DB_PROTECTED_HOSTS: "",
      NODE_ENV: "development",
    },
  };
}
