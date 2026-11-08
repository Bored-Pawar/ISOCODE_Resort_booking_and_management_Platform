"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { buildPostmarkPayload, buildWhatsAppPayload } from "@/modules/enquiries";
import { requireDevStaff } from "../_lib/access";
import { postInboundInProcess } from "./in-process";
import { simulateSchema, type SimState } from "./schema";

/**
 * Passes a provider-shaped payload to the REAL webhook handler in-process (adding the secret server side, never via a request-derived URL), so the
 * simulator exercises exactly the code a provider would. Staff only, behind DEV_TOOLS_ENABLED.
 */
export async function simulateInboundAction(_: SimState, formData: FormData): Promise<SimState> {
  await requireDevStaff();
  const parsed = simulateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors };
  }
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    return { error: "INBOUND_WEBHOOK_SECRET is not set, so the webhook would reject this." };
  }

  const { channel, name, contact, message } = parsed.data;
  const messageId = `sim-${randomUUID()}`;
  const body =
    channel === "email"
      ? buildPostmarkPayload({
          fromEmail: contact,
          fromName: name,
          subject: "Enquiry",
          body: message,
          messageId,
        })
      : buildWhatsAppPayload({ phone: contact, name, body: message, messageId });

  let res: Response;
  try {
    res = await postInboundInProcess(channel, body, secret);
  } catch {
    return { error: "The inbound handler failed." };
  }
  const json = (await res.json().catch(() => null)) as {
    enquiryIds?: string[];
    error?: string;
  } | null;
  const enquiryId = json?.enquiryIds?.[0];
  if (!res.ok || !enquiryId) {
    return { error: `Endpoint answered ${res.status}${json?.error ? ` (${json.error})` : ""}.` };
  }
  revalidatePath("/dev/test");
  return { sent: { enquiryId, channel, status: res.status } };
}
