import { describe, expect, it } from "vitest";
import { signUpSchema } from "./sign-up-schema";

const base = {
  name: "Asha Rao",
  email: "Asha@Example.com",
  phone: "",
  password: "Sup3rSecret",
  confirmPassword: "Sup3rSecret",
  consent: "on",
};
const issues = (o: Record<string, unknown>) => {
  const r = signUpSchema.safeParse({ ...base, ...o });
  return r.success ? [] : r.error.issues.map((i) => ({ path: String(i.path[0]), msg: i.message }));
};

describe("signUpSchema password confirmation", () => {
  it("accepts matching passwords and normalises the email", () => {
    const r = signUpSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("asha@example.com");
  });
  it("reports a mismatch on the confirm field", () => {
    expect(issues({ confirmPassword: "Sup3rSecreT" })).toEqual([
      { path: "confirmPassword", msg: "Passwords do not match" },
    ]);
  });
  it("is case and whitespace sensitive", () => {
    expect(issues({ confirmPassword: "Sup3rSecret " })[0]?.path).toBe("confirmPassword");
  });
  it("asks for the confirmation when it is empty", () => {
    expect(issues({ confirmPassword: "" }).map((i) => i.path)).toContain("confirmPassword");
  });
  it("still reports a short password on the password field", () => {
    const found = issues({ password: "short", confirmPassword: "short" });
    expect(found).toEqual([{ path: "password", msg: "Use at least 8 characters" }]);
  });
  it("keeps the existing rules (consent, phone)", () => {
    expect(issues({ consent: undefined })[0]?.path).toBe("consent");
    expect(issues({ phone: "abc" })[0]?.path).toBe("phone");
  });
});
