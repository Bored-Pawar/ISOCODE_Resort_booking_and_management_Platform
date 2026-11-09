"use server";
/** Q7 GM bell actions: `notifications.gm` first; the service scopes every row to `user_id = me`. */
import { inbox, type Bell } from "@/modules/enquiries";
import { inboxActor } from "./_lib/access";
import { safeError } from "@/lib/log";

export async function bellAction(): Promise<Bell | null> {
  const actor = await inboxActor("notifications.gm");
  if (!actor) return null;
  try {
    const res = await inbox.bell(actor);
    return res.ok ? res.bell : null;
  } catch (error) {
    console.error("bell failed", safeError(error));
    return null;
  }
}

export async function markReadAction(input: unknown): Promise<Bell | null> {
  const actor = await inboxActor("notifications.gm");
  if (!actor) return null;
  try {
    const res = await inbox.markRead(input, actor);
    if (!res.ok) return null;
    const next = await inbox.bell(actor);
    return next.ok ? next.bell : null;
  } catch (error) {
    console.error("markRead failed", safeError(error));
    return null;
  }
}

export async function markAllReadAction(): Promise<Bell | null> {
  const actor = await inboxActor("notifications.gm");
  if (!actor) return null;
  try {
    const res = await inbox.markAllRead(actor);
    if (!res.ok) return null;
    const next = await inbox.bell(actor);
    return next.ok ? next.bell : null;
  } catch (error) {
    console.error("markAllRead failed", safeError(error));
    return null;
  }
}
