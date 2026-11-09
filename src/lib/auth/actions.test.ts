import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { LOGIN_FAILED } from "./messages";

// next-auth does not load under vitest (it imports next/server); only its error class is used.
const { AuthError } = vi.hoisted(() => ({ AuthError: class AuthError extends Error {} }));
vi.mock("next-auth", () => ({ AuthError }));
vi.mock("next/dist/client/components/redirect-error", () => ({ isRedirectError: () => false }));
const signIn = vi.fn();
const insertReturning = vi.fn();
vi.mock("./config", () => ({ signIn: (...a: unknown[]) => signIn(...a), signOut: vi.fn() }));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    insert: () => ({
      values: () => ({ onConflictDoNothing: () => ({ returning: insertReturning }) }),
    }),
  }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));
vi.mock("@/lib/dev-tools", () => ({ isDevToolsEnabled: () => true }));

const { guestLoginAction, staffLoginAction, guestSignUpAction, devLoginAction } =
  await import("./actions");

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const SECRET = "Synthetic-Pass-123";

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
});

describe("auth forms keep input on failure", () => {
  it.each([
    ["guest", guestLoginAction],
    ["staff", staffLoginAction],
    ["dev", devLoginAction],
  ] as const)("%s login: wrong password echoes the email, never the password", async (_, act) => {
    signIn.mockRejectedValueOnce(new AuthError("CredentialsSignin"));
    const res = await act(
      undefined,
      form({ email: "a@example.test", password: SECRET, next: "/x" }),
    );
    expect(res).toMatchObject({
      error: LOGIN_FAILED,
      values: { email: "a@example.test" },
      attempt: 1,
    });
    expect(JSON.stringify(res)).not.toContain(SECRET);
  });

  it("invalid email gives a field error and a new attempt number each time", async () => {
    const first = await guestLoginAction(undefined, form({ email: "nope", password: SECRET }));
    expect(first).toMatchObject({
      fieldErrors: { email: "Enter a valid email address." },
      values: { email: "nope" },
      attempt: 1,
    });
    const second = await guestLoginAction(first, form({ email: "nope", password: "" }));
    expect(second?.attempt).toBe(2);
    expect(second?.fieldErrors?.password).toBe("Enter your password.");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("login keeps a safe next", async () => {
    signIn.mockResolvedValueOnce(undefined);
    await guestLoginAction(
      undefined,
      form({ email: "a@example.test", password: SECRET, next: "/book/details?x=1" }),
    );
    expect(signIn.mock.calls[0][1]).toMatchObject({ redirectTo: "/book/details?x=1" });
    signIn.mockResolvedValueOnce(undefined);
    await guestLoginAction(
      undefined,
      form({ email: "a@example.test", password: SECRET, next: "https://evil.example" }),
    );
    expect(signIn.mock.calls[1][1]).toMatchObject({ redirectTo: "/account" });
  });

  it("sign up validation echoes name, email, phone and consent, never passwords", async () => {
    const res = await guestSignUpAction(
      undefined,
      form({
        name: "Asha Guest",
        email: "asha@example.test",
        phone: "98765 43210",
        password: SECRET,
        confirmPassword: "different-123",
        consent: "on",
      }),
    );
    expect(res).toMatchObject({
      fieldErrors: { confirmPassword: "Passwords do not match" },
      values: {
        name: "Asha Guest",
        email: "asha@example.test",
        phone: "98765 43210",
        consent: "on",
      },
      attempt: 1,
    });
    expect(JSON.stringify(res)).not.toMatch(/Synthetic-Pass|different-123/);
  });

  it("existing email keeps the typed values", async () => {
    insertReturning.mockResolvedValueOnce([]);
    const res = await guestSignUpAction(
      undefined,
      form({
        name: "Asha",
        email: "asha@example.test",
        password: SECRET,
        confirmPassword: SECRET,
        consent: "on",
      }),
    );
    expect(res).toMatchObject({
      fieldErrors: { email: expect.stringMatching(/already exists/) },
      values: { name: "Asha" },
    });
    expect(JSON.stringify(res)).not.toContain(SECRET);
  });
});

describe("rate limits (H2)", () => {
  it("parallel wrong guesses are all counted: at most 8 reach signIn", async () => {
    signIn.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new AuthError("x")), 20)),
    );
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        staffLoginAction(undefined, form({ email: "gm@example.test", password: SECRET })),
      ),
    );
    expect(signIn).toHaveBeenCalledTimes(8);
    expect(results.filter((r) => r?.error === RATE_LIMITED_MESSAGE)).toHaveLength(12);
  });
  it("every attempt is charged, even one next-auth turns into a redirect (no refund path)", async () => {
    signIn.mockRejectedValue(
      Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT" }),
    );
    for (let i = 0; i < 8; i++)
      await staffLoginAction(undefined, form({ email: "gm@example.test", password: SECRET })).catch(
        () => undefined,
      );
    const res = await staffLoginAction(
      undefined,
      form({ email: "gm@example.test", password: SECRET }),
    );
    expect(res?.error).toBe(RATE_LIMITED_MESSAGE);
    expect(signIn).toHaveBeenCalledTimes(8);
  });
  it("login: the ninth failed try for one email in 15 minutes is refused before signIn", async () => {
    signIn.mockRejectedValue(new AuthError("CredentialsSignin"));
    for (let i = 0; i < 8; i++)
      expect(
        (await staffLoginAction(undefined, form({ email: "gm@example.test", password: SECRET })))
          ?.error,
      ).toBe(LOGIN_FAILED);
    const res = await staffLoginAction(
      undefined,
      form({ email: "GM@example.test", password: SECRET }),
    );
    expect(res?.error).toBe(RATE_LIMITED_MESSAGE);
    expect(signIn).toHaveBeenCalledTimes(8);
  });
  it("sign up: three accounts per email an hour", async () => {
    insertReturning.mockResolvedValue([]);
    const data = {
      name: "Asha",
      email: "x@example.test",
      password: SECRET,
      confirmPassword: SECRET,
      consent: "on",
    };
    for (let i = 0; i < 3; i++) await guestSignUpAction(undefined, form(data));
    expect((await guestSignUpAction(undefined, form(data)))?.error).toBe(RATE_LIMITED_MESSAGE);
  });
});
