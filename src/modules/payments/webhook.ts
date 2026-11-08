/**
 * LOCKED AREA. Mock gateway webhook (B7): signed with HMAC SHA-256 over the raw body using
 * PAYMENT_WEBHOOK_SECRET, verified in constant time, validated with Zod, then handed to
 * booking.confirmPayment. A machine entry point: authenticated by the signature, not a session
 * (02-architecture.md, exemptions). Fails closed when the secret is unset.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { booking } from "@/modules/booking";

export const PAYMENT_SIGNATURE_HEADER = "x-payment-signature";
export const MOCK_PROVIDER = "mock";

export const mockWebhookSchema = z.object({
  providerPaymentId: z.string().regex(/^mock_[0-9a-f-]{36}_[0-9a-f-]{36}$/),
  bookingId: z.uuid(),
  amountPaise: z.number().int().positive(),
  status: z.literal("SUCCESS"),
});
export type MockWebhookPayload = z.infer<typeof mockWebhookSchema>;

export function signPayload(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = Buffer.from(signPayload(body, secret), "hex");
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function secret(): string | null {
  const s = process.env.PAYMENT_WEBHOOK_SECRET;
  return s && s.length >= 16 ? s : null;
}

/** The route handler's body. MockProvider calls this same function in process. */
export async function handleMockWebhook(body: string, signature: string | null): Promise<Response> {
  const key = secret();
  if (!key || !verifySignature(body, signature, key))
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const parsed = mockWebhookSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  const result = await booking.confirmPayment({
    bookingId: parsed.data.bookingId,
    provider: MOCK_PROVIDER,
    providerPaymentId: parsed.data.providerPaymentId,
    amountPaise: parsed.data.amountPaise,
  });
  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND" ? 404 : result.code === "AMOUNT_MISMATCH" ? 409 : 400;
    return Response.json({ error: result.code }, { status });
  }
  return Response.json({ outcome: result.outcome, status: result.booking.status });
}
