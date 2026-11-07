import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { AccessError, requireRole, STAFF_ROLES, type SessionUser } from "@/lib/auth";
import { isDevToolsEnabled } from "@/lib/dev-tools";

/**
 * Server-side gate for every /dev page and server action except /dev/login. The proxy redirect
 * is only a convenience; this is the real check. Flag off or a guest: 404. Signed out: login.
 */
export async function requireDevStaff(): Promise<SessionUser> {
  await connection(); // env flag and session are per request, never prerendered
  if (!isDevToolsEnabled()) notFound();
  try {
    return await requireRole(...STAFF_ROLES);
  } catch (err) {
    if (err instanceof AccessError) {
      if (err.code === "UNAUTHENTICATED") redirect("/dev/login");
      notFound(); // signed in but not staff (a guest): do not reveal the area exists
    }
    throw err;
  }
}

/** For /dev/login: the flag only, no session. */
export async function requireDevEnabled(): Promise<void> {
  await connection();
  if (!isDevToolsEnabled()) notFound();
}
