/**
 * LOCKED AREA. Payment provider interface plus the B7 MockProvider.
 * A provider never changes booking state itself: it reports an outcome and the
 * webhook handler calls booking.confirmPayment.
 */
import { handleMockWebhook, MOCK_PROVIDER, signPayload } from "./webhook";

export { handleMockWebhook, PAYMENT_SIGNATURE_HEADER, verifySignature } from "./webhook";

export type PaymentOutcome =
  | { status: "SUCCESS"; providerPaymentId: string; amountPaise: number }
  | { status: "FAILED"; providerPaymentId: string; reason: string }
  | { status: "TIMEOUT" };

export interface PaymentProvider {
  readonly name: string;
  /** Charge exactly bookings.total_paise. */
  charge(input: { bookingId: string; amountPaise: number }): Promise<PaymentOutcome>;
}

/** The three test outcomes a guest can pick on the pay step. */
export const TEST_OUTCOMES = ["succeeds", "declined", "timeout"] as const;
export type TestOutcome = (typeof TEST_OUTCOMES)[number];

/** One provider payment id per pay attempt, so a double click replays instead of paying twice. */
export function mockPaymentId(bookingId: string, attemptId: string): string {
  return `mock_${bookingId.toLowerCase()}_${attemptId.toLowerCase()}`;
}

type Deliver = (body: string, signature: string | null) => Promise<Response>;

/**
 * Test mode gateway. Success signs a webhook with PAYMENT_WEBHOOK_SECRET and delivers it to the
 * same handler the /api/payments/mock route uses, in this process (no request-derived URL).
 * Declined returns FAILED and timeout returns TIMEOUT, neither sends a webhook.
 */
export class MockProvider implements PaymentProvider {
  readonly name = MOCK_PROVIDER;

  constructor(
    private readonly opts: { outcome: TestOutcome; attemptId: string },
    private readonly deliver: Deliver = handleMockWebhook,
  ) {}

  async charge(input: { bookingId: string; amountPaise: number }): Promise<PaymentOutcome> {
    const providerPaymentId = mockPaymentId(input.bookingId, this.opts.attemptId);
    if (this.opts.outcome === "declined")
      return { status: "FAILED", providerPaymentId, reason: "Card declined (test mode)" };
    if (this.opts.outcome === "timeout") return { status: "TIMEOUT" };
    const secret = process.env.PAYMENT_WEBHOOK_SECRET ?? "";
    const body = JSON.stringify({
      providerPaymentId,
      bookingId: input.bookingId.toLowerCase(),
      amountPaise: input.amountPaise,
      status: "SUCCESS",
    });
    const response = await this.deliver(body, secret ? signPayload(body, secret) : null);
    // The bank took the money; the webhook not landing looks like a timeout to the guest.
    if (!response.ok) return { status: "TIMEOUT" };
    return { status: "SUCCESS", providerPaymentId, amountPaise: input.amountPaise };
  }
}
