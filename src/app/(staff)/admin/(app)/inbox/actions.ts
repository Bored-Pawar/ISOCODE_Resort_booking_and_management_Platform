"use server";
/**
 * Inbox server actions. Each one calls `requirePermission` first (through `inboxActor`), then the
 * service validates with Zod and checks the role against the locked row. Nothing here sends.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/permissions";
import { inbox, retryEnquiry } from "@/modules/enquiries";
import { inboxActor } from "./_lib/access";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

const FORBIDDEN: ActionResult = { ok: false, message: "Your role cannot do this." };
const MESSAGES: Record<string, string> = {
  INVALID_INPUT: "Check the fields and try again.",
  NOT_FOUND: "This enquiry is no longer available to you.",
  FORBIDDEN: "Your role cannot do this.",
  INVALID_OWNER: "That owner's role cannot see this category. Pick another owner.",
  ALREADY_SENT: "This reply was already sent. Refresh to see it.",
  NO_DRAFT: "There is no draft yet. Use Generate draft.",
};
const fail = (code: string): ActionResult => ({
  ok: false,
  message: MESSAGES[code] ?? "Could not save. Try again.",
});
const refresh = () => revalidatePath("/admin/inbox", "layout");

export async function saveFieldsAction(input: unknown): Promise<ActionResult> {
  const actor = await inboxActor();
  if (!actor) return FORBIDDEN;
  try {
    const res = await inbox.saveFields(input, actor);
    if (!res.ok) return fail(res.code);
    refresh();
    if (!res.changed.length) return { ok: true, message: "Nothing changed." };
    if (res.draft === "ok")
      return { ok: true, message: "Saved. The draft was rebuilt from the new details." };
    if (res.draft === "locked")
      return { ok: true, message: "Saved. The reply was already sent, so it was not rebuilt." };
    if (res.draft === "failed")
      return { ok: true, message: "Saved. The draft could not be rebuilt; use Regenerate." };
    return { ok: true, message: "Saved." };
  } catch (error) {
    console.error("saveFields failed", error);
    return fail("ERROR");
  }
}

export async function rerouteAction(input: unknown): Promise<ActionResult> {
  const actor = await inboxActor();
  if (!actor) return FORBIDDEN;
  try {
    const res = await inbox.reroute(input, actor);
    if (!res.ok) return fail(res.code);
    refresh();
    return { ok: true, message: res.changed ? "Re-routed." : "Already routed there." };
  } catch (error) {
    console.error("reroute failed", error);
    return fail("ERROR");
  }
}

export async function saveDraftAction(
  input: unknown,
): Promise<ActionResult & { priceWarning?: boolean }> {
  const actor = await inboxActor();
  if (!actor) return FORBIDDEN;
  try {
    const res = await inbox.saveDraft(input, actor);
    if (!res.ok) return fail(res.code);
    refresh();
    return { ok: true, message: "Draft saved.", priceWarning: res.priceWarning };
  } catch (error) {
    console.error("saveDraft failed", error);
    return fail("ERROR");
  }
}

export async function regenerateAction(input: unknown): Promise<ActionResult> {
  const actor = await inboxActor();
  if (!actor) return FORBIDDEN;
  try {
    const res = await inbox.regenerateDraft(input, actor);
    if (!res.ok) return fail(res.code);
    refresh();
    return { ok: true, message: "New draft ready. Review it before sending." };
  } catch (error) {
    console.error("regenerate failed", error);
    return fail("ERROR");
  }
}

/** The only send path: a staff click, after the confirm dialog. Mock outbox only. */
export async function approveAndSendAction(input: unknown): Promise<ActionResult> {
  const actor = await inboxActor();
  if (!actor) return FORBIDDEN;
  try {
    const res = await inbox.approveAndSend(input, actor);
    if (!res.ok) return fail(res.code);
    refresh();
    return { ok: true, message: "Sent to the mock outbox. Nothing was emailed or messaged." };
  } catch (error) {
    console.error("approveAndSend failed", error);
    return fail("ERROR");
  }
}

export async function closeAction(input: unknown): Promise<ActionResult> {
  const actor = await inboxActor();
  if (!actor) return FORBIDDEN;
  try {
    const res = await inbox.close(input, actor);
    if (!res.ok) return fail(res.code);
    refresh();
    return { ok: true, message: "Enquiry closed." };
  } catch (error) {
    console.error("close failed", error);
    return fail("ERROR");
  }
}

const retrySchema = z.object({
  enquiryId: z.string().min(1).max(100),
  expectedUpdatedAt: z.iso.datetime(),
  expectedAttempts: z.coerce.number().int().min(3),
});

/** Failed AI lane (GM): reset attempts per R2 and queue processing; logged by the service. */
export async function retryFailedEnquiry(_previous: string, form: FormData): Promise<string> {
  // GM only, checked before reading the form; reservations and sales get no write.
  try {
    await requirePermission("enquiries.unsorted");
  } catch {
    return "Your role cannot retry enquiries.";
  }
  const input = retrySchema.safeParse({
    enquiryId: form.get("enquiryId"),
    expectedUpdatedAt: form.get("expectedUpdatedAt"),
    expectedAttempts: form.get("expectedAttempts"),
  });
  if (!input.success) return "Refresh the page and try again.";
  try {
    const result = await retryEnquiry(input.data);
    if (!result.ok)
      return "This enquiry has changed or staff have worked on it, so AI cannot be retried.";
    refresh();
    return "Retry queued. Refresh shortly to see the result.";
  } catch {
    return "Retry could not be queued. Please try again.";
  }
}
