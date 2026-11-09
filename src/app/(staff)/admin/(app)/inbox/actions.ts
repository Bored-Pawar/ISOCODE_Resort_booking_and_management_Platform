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
import { safeError } from "@/lib/log";

export type ActionResult =
  { ok: true; message: string } | { ok: false; message: string; stale?: boolean };

const FORBIDDEN: ActionResult = { ok: false, message: "Your role cannot do this." };
const MESSAGES: Record<string, string> = {
  INVALID_INPUT: "Check the fields and try again.",
  NOT_FOUND: "This enquiry is no longer available to you.",
  FORBIDDEN: "Your role cannot do this.",
  INVALID_OWNER: "That owner's role cannot see this category. Pick another owner.",
  ALREADY_SENT: "This reply was already sent. Refresh to see it.",
  NO_DRAFT: "There is no draft yet. Use Generate draft.",
  STALE_DRAFT:
    "The draft changed since you opened it (rebuilt or edited by someone). Nothing was saved or sent. Review the new draft below.",
  ALREADY_OPEN: "Reservations and the GM have already been asked. Wait for them to mark it seen.",
  NOT_OPEN: "This request was already marked seen.",
  QUOTE_REBUILDING:
    "The quote is being rebuilt from the saved details. Nothing was sent. Wait for it, or use Retry.",
  QUOTE_FAILED:
    "The quote could not be rebuilt, so this draft is out of date. Nothing was sent. Use Retry.",
  QUOTE_STALE:
    "The saved details changed after this draft was priced. Nothing was sent. Use Retry to rebuild the quote.",
  REBUILD_FAILED:
    "The quote could not be rebuilt. The old draft cannot be sent. Try again in a moment.",
};
/** Refusals that mean the page shows an out-of-date draft: refresh it rather than keep it. */
const STALE_CODES = new Set([
  "STALE_DRAFT",
  "QUOTE_REBUILDING",
  "QUOTE_FAILED",
  "QUOTE_STALE",
  "REBUILD_FAILED",
]);
const fail = (code: string): ActionResult => ({
  ok: false,
  message: MESSAGES[code] ?? "Could not save. Try again.",
  ...(STALE_CODES.has(code) ? { stale: true } : {}),
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
      return {
        ok: true,
        message:
          "Saved, but the quote could not be rebuilt. The old draft cannot be sent; use Retry.",
      };
    if (res.draft === "superseded")
      return { ok: true, message: "Saved. A newer change is rebuilding the draft." };
    return { ok: true, message: "Saved." };
  } catch (error) {
    console.error("saveFields failed", safeError(error));
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
    console.error("reroute failed", safeError(error));
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
    console.error("saveDraft failed", safeError(error));
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
    console.error("regenerate failed", safeError(error));
    return fail("ERROR");
  }
}

/** Retry: rebuild the quote and draft from the saved details (template prose, rate table only). */
export async function rebuildQuoteAction(input: unknown): Promise<ActionResult> {
  const actor = await inboxActor();
  if (!actor) return FORBIDDEN;
  try {
    const res = await inbox.rebuildQuote(input, actor);
    if (!res.ok) return fail(res.code);
    refresh();
    return { ok: true, message: "Quote rebuilt from the saved details. Review it before sending." };
  } catch (error) {
    console.error("rebuildQuote failed", safeError(error));
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
    console.error("approveAndSend failed", safeError(error));
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
    console.error("close failed", safeError(error));
    return fail("ERROR");
  }
}

/** Sales and GM: "Ask reservations and GM to look" (`attention.request` checked first). */
export async function requestAttentionAction(input: unknown): Promise<ActionResult> {
  const actor = await inboxActor("attention.request");
  if (!actor) return FORBIDDEN;
  try {
    const res = await inbox.requestAttention(input, actor);
    if (!res.ok) return fail(res.code);
    refresh();
    return { ok: true, message: "Asked reservations and the GM to look." };
  } catch (error) {
    console.error("requestAttention failed", safeError(error));
    return fail("ERROR");
  }
}

/** Reservations and GM: "Mark seen" with a reply note (`attention.resolve` checked first). */
export async function resolveAttentionAction(input: unknown): Promise<ActionResult> {
  const actor = await inboxActor("attention.resolve");
  if (!actor) return FORBIDDEN;
  try {
    const res = await inbox.resolveAttention(input, actor);
    if (!res.ok) return fail(res.code);
    refresh();
    return { ok: true, message: "Marked seen. Sales can read your note in the timeline." };
  } catch (error) {
    console.error("resolveAttention failed", safeError(error));
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
