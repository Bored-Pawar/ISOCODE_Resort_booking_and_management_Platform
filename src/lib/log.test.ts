import { expect, it } from "vitest";
import { safeError } from "./log";

it("logs the error name and SQLSTATE only, never the message or bound params", () => {
  const err = Object.assign(new Error("Failed query: insert ... params: Asha,+919800000000"), {
    cause: { code: "23505", detail: "Key (email)=(asha@example.test)" },
  });
  err.name = "DrizzleQueryError";
  const out = safeError(err);
  expect(out).toEqual({ name: "DrizzleQueryError", code: "23505" });
  expect(JSON.stringify(out)).not.toMatch(/Asha|9800|example/);
  expect(safeError("boom")).toEqual({ name: "unknown" });
  expect(safeError({ code: "not a sqlstate" })).toEqual({ name: "unknown" });
});
