import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AccessError, type SessionUser } from "@/lib/auth";
import { requirePermission, type Capability } from "@/lib/auth/permissions";
import type { AdminActor } from "@/modules/admin";

export type StaffAccess = { user: SessionUser; actor: AdminActor } | { forbidden: true };

/**
 * Page loaders: `requirePermission` on the server. Signed out goes to the staff login; a role
 * without the capability gets `{ forbidden: true }` and the page renders the 403 screen.
 */
export async function staffPage(cap: Capability): Promise<StaffAccess> {
  await connection();
  try {
    const user = await requirePermission(cap);
    return { user, actor: { userId: user.id, role: user.role } };
  } catch (err) {
    if (err instanceof AccessError) {
      if (err.code === "UNAUTHENTICATED") redirect("/admin/login");
      return { forbidden: true };
    }
    throw err;
  }
}

/**
 * Server actions: `requirePermission` first. Returns the actor, or null when the caller is signed
 * out or lacks the capability; the action then answers FORBIDDEN and writes nothing.
 */
export async function actionActor(cap: Capability): Promise<AdminActor | null> {
  try {
    const user = await requirePermission(cap);
    return { userId: user.id, role: user.role };
  } catch (err) {
    if (err instanceof AccessError) return null;
    throw err;
  }
}
