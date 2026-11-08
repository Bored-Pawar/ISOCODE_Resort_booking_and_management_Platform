import { INBOUND_SECRET_HEADER } from "@/modules/enquiries";
import { POST as postEmail } from "@/app/api/inbound/email/route";
import { POST as postWhatsApp } from "@/app/api/inbound/whatsapp/route";
import type { SimChannel } from "./schema";

type Handler = (request: Request) => Response | Promise<Response>;

const HANDLERS: Record<SimChannel, Handler> = { email: postEmail, whatsapp: postWhatsApp };

/**
 * Calls the real inbound route handler in this process. No network hop and no request-derived
 * URL, so a forged Host or x-forwarded-* header cannot redirect the secret anywhere. The URL below
 * is a fixed placeholder that the handler never dials.
 */
export function postInboundInProcess(
  channel: SimChannel,
  body: unknown,
  secret: string,
  handlers: Record<SimChannel, Handler> = HANDLERS,
): Response | Promise<Response> {
  const request = new Request(`http://inbound.invalid/api/inbound/${channel}`, {
    method: "POST",
    headers: { "content-type": "application/json", [INBOUND_SECRET_HEADER]: secret },
    body: JSON.stringify(body),
  });
  return handlers[channel](request);
}
