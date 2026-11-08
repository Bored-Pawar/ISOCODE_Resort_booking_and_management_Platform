import { and, eq, inArray } from "drizzle-orm";
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

/** Names and emails for staff screens (A5, dev outbox). Callers have already required a staff role. */
export async function getGuestContacts(
  ids: string[],
): Promise<Map<string, { name: string; email: string }>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const rows = await getDb()
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, { name: r.name, email: r.email }]));
}
