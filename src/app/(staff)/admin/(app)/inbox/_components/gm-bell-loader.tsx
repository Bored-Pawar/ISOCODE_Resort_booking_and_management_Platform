import { inbox, type Bell } from "@/modules/enquiries";
import { inboxActor } from "../_lib/access";
import { GmBell } from "./gm-bell";
import { safeError } from "@/lib/log";

/** Server half of the bell: `notifications.gm` first, then the GM's own rows. */
export async function GmBellLoader() {
  const actor = await inboxActor("notifications.gm");
  if (!actor) return null;
  let data: Bell = { unread: 0, items: [] };
  try {
    const res = await inbox.bell(actor);
    if (!res.ok) return null;
    data = res.bell;
  } catch (error) {
    console.error("bell load failed", safeError(error));
  }
  return <GmBell initial={data} />;
}
