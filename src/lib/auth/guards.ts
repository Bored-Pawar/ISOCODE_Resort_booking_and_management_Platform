import { AccessError, type Role, type SessionUser } from "./types";
import { auth } from "./config";

/** Pure checks (unit tested). */
export function assertRole(user: SessionUser | null, roles: readonly Role[]): SessionUser {
  if (!user) throw new AccessError("UNAUTHENTICATED");
  if (!roles.includes(user.role)) throw new AccessError("FORBIDDEN");
  return user;
}

/** Only the guest who owns the record. Staff use requireRole instead. */
export function assertGuestOwner(user: SessionUser | null, ownerGuestId: string): SessionUser {
  if (!user) throw new AccessError("UNAUTHENTICATED");
  if (user.role !== "guest" || user.id !== ownerGuestId) throw new AccessError("FORBIDDEN");
  return user;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.role) return null;
  return { id: u.id, email: u.email ?? "", name: u.name ?? "", role: u.role };
}

/** Call first in every server action and route handler that needs a signed-in role. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  return assertRole(await getSessionUser(), roles);
}

/** Call in guest-facing actions that touch one guest's data (e.g. a booking). */
export async function requireGuestOwner(ownerGuestId: string): Promise<SessionUser> {
  return assertGuestOwner(await getSessionUser(), ownerGuestId);
}

export function accessErrorResponse(err: unknown): Response | null {
  if (!(err instanceof AccessError)) return null;
  const status = err.code === "UNAUTHENTICATED" ? 401 : 403;
  return Response.json({ error: err.code }, { status });
}
