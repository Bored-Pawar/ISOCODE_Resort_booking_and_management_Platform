import { afterEach, describe, expect, it, vi } from "vitest";
import { holdMinutes, isTransactionConflict, postgresCode } from "./transaction";
afterEach(() => vi.unstubAllEnvs());
describe("booking transaction policy", () => {
  it("recognises PostgreSQL conflicts through driver wrappers, and rejects other errors", () => {
    expect(isTransactionConflict({ cause: { cause: { code: "40P01" } } })).toBe(true);
    expect(isTransactionConflict({ code: "40001" })).toBe(true);
    expect(isTransactionConflict({ cause: { code: "23514" } })).toBe(false);
    const cycle: { cause?: unknown } = {};
    cycle.cause = cycle;
    expect(postgresCode(cycle)).toBeUndefined();
  });
  it("uses a positive integer HOLD_MINUTES and fails closed for misconfiguration", () => {
    vi.stubEnv("HOLD_MINUTES", undefined);
    expect(holdMinutes()).toBe(10);
    vi.stubEnv("HOLD_MINUTES", "3");
    expect(holdMinutes()).toBe(3);
    for (const value of ["0", "-1", "1.5", "bad", ""]) {
      vi.stubEnv("HOLD_MINUTES", value);
      expect(holdMinutes).toThrow("HOLD_MINUTES");
    }
  });
});
