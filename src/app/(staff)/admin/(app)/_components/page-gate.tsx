import type { Capability } from "@/lib/auth/permissions";
import { staffPage } from "../_lib/access";
import { Forbidden } from "./forbidden";

/**
 * Renders the 403 screen instead of `children` when the signed-in role lacks `cap` (signed out
 * goes to the staff login). Wrap it in <Suspense>: it reads the session at request time.
 */
export async function PageGate({ cap, children }: { cap: Capability; children: React.ReactNode }) {
  const access = await staffPage(cap);
  if ("forbidden" in access) return <Forbidden />;
  return <>{children}</>;
}
