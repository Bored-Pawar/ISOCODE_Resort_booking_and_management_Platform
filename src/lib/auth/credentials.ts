import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "@/db/schema";
import { getDb } from "@/lib/db";
import type { Role, SessionUser } from "./types";

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

/** Returns the user when email + password match and the role is allowed, else null. */
export async function verifyCredentials(
  input: unknown,
  allowedRoles: readonly Role[],
): Promise<SessionUser | null> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;
  const [row] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  const ok = await bcrypt.compare(password, row?.passwordHash ?? DUMMY_HASH);
  if (!row || !ok || !allowedRoles.includes(row.role as Role)) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role as Role };
}
