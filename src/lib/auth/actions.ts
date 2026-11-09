"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { users } from "@/db/schema";
import { getDb } from "@/lib/db";
import { CONSENT_VERSION } from "@/lib/consent";
import { isDevToolsEnabled } from "@/lib/dev-tools";
import { credentialsSchema } from "./credentials";
import { signIn, signOut } from "./config";
import { safeNext } from "./safe-next";
import { signUpSchema } from "./sign-up-schema";
import { allow, loginGate, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { LOGIN_FAILED } from "./messages";

export type FormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string>;
      /** Non secret values echoed back so a failed submit keeps what was typed. Never passwords. */
      values?: Record<string, string>;
      /** Changes on every failed submit; the form remounts with `key={attempt}`. */
      attempt?: number;
    }
  | undefined;

/** Fields that may be echoed back. Passwords are never in this list. */
const ECHO = ["email", "name", "phone", "consent"] as const;

function echo(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const k of ECHO) {
    const v = formData.get(k);
    if (typeof v === "string") values[k] = v.slice(0, 254);
  }
  return values;
}
/** Every failed result carries the typed values and a new attempt number. */
function failed(
  prev: FormState,
  formData: FormData,
  out: Omit<NonNullable<FormState>, "values" | "attempt">,
): FormState {
  return { ...out, values: echo(formData), attempt: (prev?.attempt ?? 0) + 1 };
}

// Public entry points (login, sign up, sign out): Zod validated, no role to require yet.
// Rate limited per IP and per email (in memory, per instance; `lib/rate-limit`).

async function login(
  provider: "guest" | "staff",
  prev: FormState,
  formData: FormData,
  fallback: string,
): Promise<FormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues)
      fieldErrors[String(issue.path[0])] ??=
        issue.path[0] === "password" ? "Enter your password." : "Enter a valid email address.";
    return failed(prev, formData, { fieldErrors });
  }
  // Only failed logins are charged; the strict window is IP + email (02 Security 5).
  const gate = await loginGate(parsed.data.email);
  if (!gate.ok) return failed(prev, formData, { error: RATE_LIMITED_MESSAGE });
  try {
    await signIn(provider, {
      ...parsed.data,
      redirectTo: safeNext(formData.get("next"), fallback),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      gate.failed();
      return failed(prev, formData, { error: LOGIN_FAILED });
    }
    throw err; // includes the redirect on success
  }
}

export async function guestLoginAction(prev: FormState, formData: FormData) {
  return login("guest", prev, formData, "/account");
}

export async function staffLoginAction(prev: FormState, formData: FormData) {
  return login("staff", prev, formData, "/admin");
}

export async function guestSignUpAction(prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return failed(prev, formData, { fieldErrors });
  }
  if (!(await allow("signup", parsed.data.email)))
    return failed(prev, formData, { error: RATE_LIMITED_MESSAGE });
  const { name, email, phone, password } = parsed.data;
  const inserted = await getDb()
    .insert(users)
    .values({
      email,
      name,
      phone,
      role: "guest",
      passwordHash: await bcrypt.hash(password, 10),
      consentAt: new Date(),
      consentVersion: CONSENT_VERSION,
    })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  if (inserted.length === 0) {
    return failed(prev, formData, {
      fieldErrors: { email: "An account with this email already exists. Try signing in." },
    });
  }
  try {
    await signIn("guest", {
      email,
      password,
      redirectTo: safeNext(formData.get("next"), "/account"),
    });
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthError)
      return failed(prev, formData, { error: "Account created. Please sign in." });
    throw err;
  }
}

/** Same staff credentials as /admin; only the landing page differs. Off unless dev tools are on. */
export async function devLoginAction(prev: FormState, formData: FormData) {
  if (!isDevToolsEnabled()) return { error: "Not available." };
  return login("staff", prev, formData, "/dev");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
