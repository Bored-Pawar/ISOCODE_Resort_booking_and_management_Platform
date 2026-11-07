import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users } from "@/db/schema";
import { getDb } from "@/lib/db";
import { verifyCredentials } from "@/lib/auth/credentials";
import { STAFF_ROLES } from "@/lib/auth/types";
import { connect, ensureMigrated, testUrl } from "./helpers";

const sql = connect(); // validates TEST_DATABASE_URL before DATABASE_URL is overridden
const originalDatabaseUrl = process.env.DATABASE_URL;
const stamp = Date.now();
const guestEmail = `it-guest-${stamp}@test.example`;
const gmEmail = `it-gm-${stamp}@test.example`;

beforeAll(async () => {
  // getDb() reads DATABASE_URL: point it at the test database for this file, never at dev.
  process.env.DATABASE_URL = testUrl();
  await ensureMigrated(sql);
  const passwordHash = await bcrypt.hash("Correct#Pass1", 4);
  await getDb()
    .insert(users)
    .values([
      { email: guestEmail, name: "IT Guest", role: "guest", passwordHash },
      { email: gmEmail, name: "IT GM", role: "gm", passwordHash },
    ]);
});
afterAll(async () => {
  for (const email of [guestEmail, gmEmail])
    await getDb().delete(users).where(eq(users.email, email));
  await sql.end();
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("verifyCredentials", () => {
  it("accepts the right password for an allowed role", async () => {
    const u = await verifyCredentials(
      { email: guestEmail.toUpperCase(), password: "Correct#Pass1" },
      ["guest"],
    );
    expect(u).toMatchObject({ email: guestEmail, role: "guest" });
  });
  it("rejects wrong passwords and unknown emails", async () => {
    expect(await verifyCredentials({ email: guestEmail, password: "nope" }, ["guest"])).toBeNull();
    expect(
      await verifyCredentials({ email: "nobody@test.example", password: "x" }, ["guest"]),
    ).toBeNull();
  });
  it("keeps staff and guest logins separate", async () => {
    expect(
      await verifyCredentials({ email: guestEmail, password: "Correct#Pass1" }, STAFF_ROLES),
    ).toBeNull();
    expect(
      await verifyCredentials({ email: gmEmail, password: "Correct#Pass1" }, ["guest"]),
    ).toBeNull();
    expect(
      (await verifyCredentials({ email: gmEmail, password: "Correct#Pass1" }, STAFF_ROLES))?.role,
    ).toBe("gm");
  });
  it("rejects malformed input", async () => {
    expect(await verifyCredentials({ email: "not-an-email", password: "x" }, ["guest"])).toBeNull();
    expect(await verifyCredentials(undefined, ["guest"])).toBeNull();
  });
});
