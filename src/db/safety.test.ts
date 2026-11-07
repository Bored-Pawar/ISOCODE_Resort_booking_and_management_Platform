import { describe, expect, it } from "vitest";
import { assertSafeDestructiveTarget, childEnvForTests, dbHost } from "./safety";

const DEV = "postgresql://u:p@ep-dev-123.ap-south-1.aws.neon.tech/db";
const DEV_POOLED = "postgresql://u:p@ep-dev-123-pooler.ap-south-1.aws.neon.tech/db";
const TEST = "postgresql://u:p@ep-test-456.ap-south-1.aws.neon.tech/db";

const dev = { DATABASE_URL: DEV_POOLED, DATABASE_URL_UNPOOLED: DEV };
const testEnv = { ...dev, TEST_DATABASE_URL: TEST };

describe("assertSafeDestructiveTarget", () => {
  it("accepts the development URL by default", () => {
    expect(assertSafeDestructiveTarget(dev)).toMatchObject({ mode: "dev", url: DEV });
  });

  it("accepts a separate test database in test mode", () => {
    const t = assertSafeDestructiveTarget({ ...testEnv, DB_TARGET: "test" });
    expect(t).toMatchObject({
      mode: "test",
      url: TEST,
      host: "ep-test-456.ap-south-1.aws.neon.tech",
    });
  });

  it("fails closed when the target URL is missing, with no fallback", () => {
    expect(() => assertSafeDestructiveTarget({})).toThrow("DATABASE_URL_UNPOOLED is required");
    expect(() => assertSafeDestructiveTarget({ DATABASE_URL: DEV_POOLED })).toThrow(
      "DATABASE_URL_UNPOOLED is required",
    );
    // test mode never falls back to the dev URLs
    expect(() => assertSafeDestructiveTarget({ ...dev, DB_TARGET: "test" })).toThrow(
      "TEST_DATABASE_URL is required",
    );
    expect(() =>
      assertSafeDestructiveTarget({ ...dev, DB_TARGET: "test", TEST_DATABASE_URL: "  " }),
    ).toThrow("TEST_DATABASE_URL is required");
  });

  it("rejects an unparsable URL", () => {
    expect(() => assertSafeDestructiveTarget({ DATABASE_URL_UNPOOLED: "not a url" })).toThrow(
      "not a valid URL",
    );
  });

  it("refuses protected hosts in both modes", () => {
    const protectedHosts = "prod-endpoint, ep-dev-123";
    expect(() =>
      assertSafeDestructiveTarget({ ...dev, DB_PROTECTED_HOSTS: protectedHosts }),
    ).toThrow("protected host");
    expect(() =>
      assertSafeDestructiveTarget({
        ...testEnv,
        DB_TARGET: "test",
        DB_PROTECTED_HOSTS: "ep-test-456",
      }),
    ).toThrow("protected host");
    expect(assertSafeDestructiveTarget({ ...dev, DB_PROTECTED_HOSTS: "other-host" }).mode).toBe(
      "dev",
    );
  });

  it("refuses when the test database is the development database", () => {
    // same host as DATABASE_URL_UNPOOLED
    expect(() =>
      assertSafeDestructiveTarget({ ...dev, DB_TARGET: "test", TEST_DATABASE_URL: DEV }),
    ).toThrow("same database");
    // pooled endpoint of the dev branch is still the dev branch
    expect(() =>
      assertSafeDestructiveTarget({ ...dev, DB_TARGET: "test", TEST_DATABASE_URL: DEV_POOLED }),
    ).toThrow("same database");
    // only DATABASE_URL set
    expect(() =>
      assertSafeDestructiveTarget({
        DATABASE_URL: DEV_POOLED,
        DB_TARGET: "test",
        TEST_DATABASE_URL: DEV,
      }),
    ).toThrow("same database as DATABASE_URL");
  });

  it("refuses in production", () => {
    expect(() => assertSafeDestructiveTarget({ ...dev, NODE_ENV: "production" })).toThrow(
      "NODE_ENV=production",
    );
    expect(() =>
      assertSafeDestructiveTarget({ ...testEnv, DB_TARGET: "test", NODE_ENV: "production" }),
    ).toThrow("NODE_ENV=production");
  });
});

describe("childEnvForTests", () => {
  it("marks the child as a test run so it targets TEST_DATABASE_URL, not DATABASE_URL*", () => {
    const child = childEnvForTests(testEnv);
    expect(child.DB_TARGET).toBe("test");
    expect(child.TEST_DATABASE_URL).toBe(TEST);
    // what the child's own guard resolves
    expect(assertSafeDestructiveTarget(child).url).toBe(TEST);
  });

  it("does not mutate the parent env", () => {
    const parent = { ...testEnv };
    childEnvForTests(parent);
    expect("DB_TARGET" in parent).toBe(false);
  });

  it("throws before spawning when the test URL is missing or equals dev", () => {
    expect(() => childEnvForTests(dev)).toThrow("TEST_DATABASE_URL is required");
    expect(() => childEnvForTests({ ...dev, TEST_DATABASE_URL: DEV })).toThrow("same database");
  });
});

describe("dbHost", () => {
  it("lower-cases and strips the Neon pooler suffix", () => {
    expect(dbHost("postgresql://u:p@EP-A-1-pooler.x.neon.tech/db")).toBe("ep-a-1.x.neon.tech");
    expect(dbHost("postgresql://u:p@localhost:5432/db")).toBe("localhost");
  });
});
