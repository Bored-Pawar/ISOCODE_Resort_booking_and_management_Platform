/**
 * Guard for scripts and tests that WRITE destructively (seed, reset, integration tests).
 * Pure: takes an env object, reads nothing global, so it is unit tested without a database.
 *
 * Target selection:
 *   DB_TARGET=test  -> TEST_DATABASE_URL        (set only by childEnvForTests, i.e. by the test suite)
 *   otherwise       -> DATABASE_URL_UNPOOLED    (development)
 * There is no fallback between the two. Fail closed: anything doubtful throws.
 */
export type Env = Record<string, string | undefined>;

export type DbTarget = { url: string; host: string; mode: "dev" | "test" };

const POOLER_SUFFIX = /-pooler(?=\.|$)/;

/**
 * Lower-case hostname with Neon's "-pooler" suffix removed, so the pooled and direct
 * endpoints of one branch compare equal. Throws on an unparsable URL.
 */
export function dbHost(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error("Database URL is not a valid URL");
  }
  if (!host) throw new Error("Database URL has no host");
  return host.replace(POOLER_SUFFIX, "");
}

function protectedFragments(env: Env): string[] {
  return (env.DB_PROTECTED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(POOLER_SUFFIX, ""))
    .filter(Boolean);
}

export function assertSafeDestructiveTarget(env: Env): DbTarget {
  const mode = env.DB_TARGET === "test" ? "test" : "dev";
  const name = mode === "test" ? "TEST_DATABASE_URL" : "DATABASE_URL_UNPOOLED";
  const url = env[name]?.trim();
  if (!url) throw new Error(`${name} is required for this operation`);
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing destructive database operation when NODE_ENV=production");
  }

  const host = dbHost(url);
  const hit = protectedFragments(env).find((fragment) => host.includes(fragment));
  if (hit) throw new Error(`Refusing protected host ${host} (matches DB_PROTECTED_HOSTS)`);

  if (mode === "test") {
    for (const devName of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const) {
      const dev = env[devName]?.trim();
      if (dev && dbHost(dev) === host) {
        throw new Error(`TEST_DATABASE_URL points at the same database as ${devName} (${host})`);
      }
    }
  }
  return { url, host, mode };
}

/**
 * Env for a child process (seed, reset) spawned by tests. Validates first, then marks the
 * child as a test run so it targets TEST_DATABASE_URL. DATABASE_URL* stay in the env only so the
 * child can run the same-database check; they are never its target.
 */
export function childEnvForTests(env: Env): Env {
  assertSafeDestructiveTarget({ ...env, DB_TARGET: "test" });
  return { ...env, DB_TARGET: "test" };
}
