import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users } from "@/db/schema";
import { getDb } from "@/lib/db";
import { verifyCredentials } from "@/lib/auth/credentials";
import { STAFF_ROLES } from "@/lib/auth/types";
import { connect, ensureMigrated } from "./helpers";

const sql = connect();
const stamp = Date.now();
const guestEmail = `it-guest-${stamp}@test.example`;
const gmEmail = `it-gm-${stamp}@test.example`;

beforeAll(async () => {
  process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL;
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
