"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  buildPostmarkPayload,
  buildWhatsAppPayload,
  INBOUND_SECRET_HEADER,
} from "@/modules/enquiries";
import { requireDevStaff } from "../_lib/access";
import { simulateSchema, type SimState } from "./schema";

/**
 * Posts a provider-shaped payload to the REAL webhook (server side, adding the secret), so the
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

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  let res: Response;
  try {
    res = await fetch(`${proto}://${host}/api/inbound/${channel}`, {
      method: "POST",
      headers: { "content-type": "application/json", [INBOUND_SECRET_HEADER]: secret },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { error: "Could not reach the inbound endpoint." };
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
