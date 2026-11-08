import { and, eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getDb } from "@/lib/db";

/** What the booking details step shows a signed-in guest. Callers pass the session user id only. */
export type GuestProfile = {
  name: string;
  email: string;
  phone: string | null;
  consentAt: string | null;
};

export async function getGuestProfile(userId: string): Promise<GuestProfile | null> {
  const [u] = await getDb()
    .select({
      name: users.name,
      email: users.email,
      phone: users.phone,
      consentAt: users.consentAt,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.role, "guest")));
  if (!u) return null;
  return { ...u, consentAt: u.consentAt?.toISOString() ?? null };
}

/** Sets the guest's own phone (already validated with phoneField). Null clears it. */
export async function updateGuestPhone(userId: string, phone: string | null): Promise<void> {
  await getDb()
    .update(users)
    .set({ phone })
    .where(and(eq(users.id, userId), eq(users.role, "guest")));
}
