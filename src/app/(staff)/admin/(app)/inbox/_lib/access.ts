import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AccessError, getSessionUser, type SessionUser } from "@/lib/auth";
import { can, requirePermission, type Capability } from "@/lib/auth/permissions";
import type { InboxActor } from "@/modules/enquiries";

/** Any of these opens the inbox; each lane, row and action is checked again below. */
export const INBOX_CAPS = [
  "enquiries.room",
  "enquiries.events",
  "enquiries.complaints",
  "enquiries.unsorted",
] as const satisfies readonly Capability[];

/** `requirePermission` for the first inbox capability the signed-in role holds. */
async function requireInbox(): Promise<SessionUser> {
  const user = await getSessionUser();
  const cap = INBOX_CAPS.find((c) => can(user?.role, c)) ?? INBOX_CAPS[0];
  return requirePermission(cap);
}

export type InboxAccess = { user: SessionUser; actor: InboxActor } | { forbidden: true };

/** Page loaders: signed out goes to the staff login, a role without any inbox capability gets 403. */
export async function inboxPage(): Promise<InboxAccess> {
  await connection();
  try {
    const user = await requireInbox();
    return { user, actor: { userId: user.id, role: user.role } };
  } catch (err) {
    if (err instanceof AccessError) {
      if (err.code === "UNAUTHENTICATED") redirect("/admin/login");
      return { forbidden: true };
    }
    throw err;
  }
}

/** Server actions: the actor, or null (the action answers FORBIDDEN and writes nothing). */
export async function inboxActor(cap?: Capability): Promise<InboxActor | null> {
  try {
    const user = cap ? await requirePermission(cap) : await requireInbox();
    return { userId: user.id, role: user.role };
  } catch (err) {
    if (err instanceof AccessError) return null;
    throw err;
  }
}
