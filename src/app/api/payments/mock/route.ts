import { handleMockWebhook, PAYMENT_SIGNATURE_HEADER } from "@/modules/payments";

/**
 * Mock gateway webhook (B7). Machine endpoint: authenticated by the HMAC signature header, not a
 * session role (02-architecture.md, exemptions). Body is validated with Zod in the handler.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (body.length > 4096) return Response.json({ error: "INVALID_INPUT" }, { status: 413 });
  return handleMockWebhook(body, request.headers.get(PAYMENT_SIGNATURE_HEADER));
}
