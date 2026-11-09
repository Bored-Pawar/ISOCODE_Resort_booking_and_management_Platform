import { describe, expect, it } from "vitest";
import { deployPlan } from "../../scripts/db-deploy-plan";

const PROD = "postgresql://u:p@ep-prod-123.us-east-2.aws.neon.tech/neondb?sslmode=require";
const ok = { ALLOW_PRODUCTION_SEED: "yes", PRODUCTION_DATABASE_URL_UNPOOLED: PROD };

describe("db:deploy guard", () => {
  it("refuses without ALLOW_PRODUCTION_SEED=yes", () => {
    expect(() => deployPlan({ PRODUCTION_DATABASE_URL_UNPOOLED: PROD })).toThrow(
      /ALLOW_PRODUCTION_SEED/,
    );
    expect(() => deployPlan({ ...ok, ALLOW_PRODUCTION_SEED: "true" })).toThrow(
      /ALLOW_PRODUCTION_SEED/,
    );
  });
  it("refuses without an explicit production URL (never falls back to .env.local)", () => {
    expect(() => deployPlan({ ALLOW_PRODUCTION_SEED: "yes", DATABASE_URL_UNPOOLED: PROD })).toThrow(
      /PRODUCTION_DATABASE_URL_UNPOOLED is not set/,
    );
  });
  it("refuses a pooled URL, a non-postgres URL and the dev or test database", () => {
    expect(() =>
      deployPlan({
        ...ok,
        PRODUCTION_DATABASE_URL_UNPOOLED: PROD.replace("ep-prod-123", "ep-prod-123-pooler"),
      }),
    ).toThrow(/unpooled/);
    expect(() =>
      deployPlan({ ...ok, PRODUCTION_DATABASE_URL_UNPOOLED: "https://x.example" }),
    ).toThrow(/postgres URL/);
    expect(() =>
      deployPlan({ ...ok, DATABASE_URL: PROD.replace("ep-prod-123", "ep-prod-123-pooler") }),
    ).toThrow(/same database as DATABASE_URL/);
    expect(() => deployPlan({ ...ok, TEST_DATABASE_URL: PROD })).toThrow(/TEST_DATABASE_URL/);
    // .env.local values count too, though they never supply the target.
    expect(() => deployPlan(ok, [], { DATABASE_URL_UNPOOLED: PROD })).toThrow(
      /DATABASE_URL_UNPOOLED/,
    );
  });
  it("prints a host fragment and pins every child target to the production URL", () => {
    const plan = deployPlan({
      ...ok,
      DATABASE_URL_UNPOOLED: "postgresql://u:p@ep-dev.us-east-2.aws.neon.tech/x",
      DB_PROTECTED_HOSTS: "ep-prod-123",
    });
    expect(plan.hostFragment).toBe("ep-prod-123 (us-east-2.aws)");
    expect(plan.steps).toEqual(["migrate", "seed"]);
    expect(plan.childEnv).toMatchObject({
      DATABASE_URL: PROD,
      DATABASE_URL_UNPOOLED: PROD,
      DB_TARGET: "",
      TEST_DATABASE_URL: "",
      DB_PROTECTED_HOSTS: "",
      NODE_ENV: "development",
    });
  });
  it("--migrate-only skips the seed", () => {
    expect(deployPlan(ok, ["--migrate-only"]).steps).toEqual(["migrate"]);
  });
});
