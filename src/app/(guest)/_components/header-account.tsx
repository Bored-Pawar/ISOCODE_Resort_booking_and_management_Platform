import { connection } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { initials } from "../_lib/format";
import { AccountMenu, SignInLink } from "./account-menu";

/**
 * Header right side. Server component: reads the session at request time (inside <Suspense> in the
 * site layout), then renders the profile menu for a signed-in guest, else a sign in link that
 * returns to the current page.
 */
export async function HeaderAccount() {
  // Auth.js uses crypto.getRandomValues() inside auth(); render at request time first.
  await connection();
  const user = await getSessionUser().catch(() => null);
  if (!user || user.role !== "guest") return <SignInLink />;
  return <AccountMenu name={user.name || user.email} initials={initials(user.name, user.email)} />;
}

export function HeaderAccountFallback() {
  return <span className="inline-block h-11 w-20" aria-hidden />;
}
