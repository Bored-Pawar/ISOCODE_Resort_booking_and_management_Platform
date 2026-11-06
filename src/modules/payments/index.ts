/**
 * LOCKED AREA. Provider interface only in S0; MockProvider arrives in B7.
 * A provider never changes booking state itself: it reports an outcome and the
 * webhook route calls booking.confirmPayment.
 */
export type PaymentOutcome =
  | { status: "SUCCESS"; providerPaymentId: string; amountPaise: number }
  | { status: "FAILED"; providerPaymentId: string; reason: string }
  | { status: "TIMEOUT" };

export interface PaymentProvider {
  readonly name: string;
  /** Charge exactly bookings.total_paise. */
  charge(input: { bookingId: string; amountPaise: number }): Promise<PaymentOutcome>;
}
