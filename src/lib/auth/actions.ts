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

export type FormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

// Public entry points (login, sign up, sign out): Zod validated, no role to require yet.

async function login(
  provider: "guest" | "staff",
  formData: FormData,
  fallback: string,
): Promise<FormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };
  try {
    await signIn(provider, {
      ...parsed.data,
      redirectTo: safeNext(formData.get("next"), fallback),
    });
  } catch (err) {
    if (err instanceof AuthError) return { error: "That email and password do not match." };
    throw err; // includes the redirect on success
  }
}

export async function guestLoginAction(_: FormState, formData: FormData) {
  return login("guest", formData, "/account");
}

export async function staffLoginAction(_: FormState, formData: FormData) {
  return login("staff", formData, "/admin");
}

export async function guestSignUpAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
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
    return { fieldErrors: { email: "An account with this email already exists. Try signing in." } };
  }
  try {
    await signIn("guest", {
      email,
      password,
      redirectTo: safeNext(formData.get("next"), "/account"),
    });
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthError) return { error: "Account created. Please sign in." };
    throw err;
  }
}

/** Same staff credentials as /admin; only the landing page differs. Off unless dev tools are on. */
export async function devLoginAction(_: FormState, formData: FormData) {
  if (!isDevToolsEnabled()) return { error: "Not available." };
  return login("staff", formData, "/dev");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
