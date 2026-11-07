import { describe, expect, it } from "vitest";
import { isDevToolsEnabled } from "./dev-tools";

describe("isDevToolsEnabled", () => {
  it("is on only for the exact string 'true'", () => {
    expect(isDevToolsEnabled({ DEV_TOOLS_ENABLED: "true" })).toBe(true);
  });
  it.each([undefined, "", "false", "TRUE", "1", "yes", " true"])("is off for %j", (v) => {
    expect(isDevToolsEnabled({ DEV_TOOLS_ENABLED: v })).toBe(false);
  });
  it("is off when the variable is absent", () => {
    expect(isDevToolsEnabled({})).toBe(false);
  });
});
