"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { booking, type Booking } from "@/modules/booking";
import { acquireBookingHold } from "@/modules/booking/actions";
import { MockProvider, TEST_OUTCOMES } from "@/modules/payments";
import { detailsHref } from "../../../_lib/cart";
import { holdStep, reusableHold } from "../../../_lib/hold-flow";
import { cartFromBooking, payGate, type PayStep } from "../../../_lib/pay-flow";

export type PayFormState = { step?: PayStep } | undefined;

const refSchema = z.string().regex(/^CA-[0-9A-Z]{5}$/);
const paySchema = z.object({
  ref: refSchema,
  outcome: z.enum(TEST_OUTCOMES),
  attemptId: z.uuid(),
});

/** The guest's own booking by ref. A ref is never authorisation: booking.get checks the owner. */
async function ownBooking(ref: string): Promise<Booking | null> {
  const guest = await requireRole("guest");
  const got = await booking.get({ ref }, { userId: guest.id, role: "guest" });
  return got.ok ? got.booking : null;
}

const confirmationHref = (ref: string) => `/booking/${encodeURIComponent(ref)}`;

/**
 * "Pay ₹x (test mode)". Zod, the guest session and the owner check first; the amount is always
 * the saved bookings.total_paise; the 2 minute gate is rechecked here (the button is not
 * trusted). The attempt id comes from the form, so a double click replays the same payment.
 */
export async function payBooking(_: PayFormState, formData: FormData): Promise<PayFormState> {
  const parsed = paySchema.safeParse({
    ref: formData.get("ref"),
    outcome: formData.get("outcome"),
    attemptId: formData.get("attemptId"),
  });
  await requireRole("guest");
  if (!parsed.success)
    return { step: { kind: "error", message: "Choose a test outcome and try again." } };
  const b = await ownBooking(parsed.data.ref);
  if (!b) return { step: { kind: "error", message: "We could not find this booking." } };
  if (b.status === "CONFIRMED") redirect(confirmationHref(b.ref));
  const gate = payGate(b, Date.now());
  if (gate !== "open") return { step: { kind: gate } };

  const provider = new MockProvider({
    outcome: parsed.data.outcome,
    attemptId: parsed.data.attemptId,
  });
  const charged = await provider.charge({ bookingId: b.id, amountPaise: b.totalPaise });
  if (charged.status === "FAILED") return { step: { kind: "declined" } };
  if (charged.status === "TIMEOUT") return { step: { kind: "timeout" } };

  const after = await ownBooking(b.ref);
  if (after?.status === "CONFIRMED") redirect(confirmationHref(b.ref));
  // Paid, but the hold had ended first: confirmPayment recorded it as REFUND_PENDING.
  if (after && after.status !== "HELD") return { step: { kind: "refund-pending" } };
  return { step: { kind: "timeout" } };
}

/** "Check status" after a timeout: re-reads the booking. */
export async function checkPayment(ref: unknown): Promise<PayFormState> {
  const parsed = refSchema.safeParse(ref);
  await requireRole("guest");
  if (!parsed.success)
    return { step: { kind: "error", message: "We could not find this booking." } };
  const b = await ownBooking(parsed.data);
  if (!b) return { step: { kind: "error", message: "We could not find this booking." } };
  if (b.status === "CONFIRMED") redirect(confirmationHref(b.ref));
  if (b.status !== "HELD") return { step: { kind: "ended" } };
  return { step: { kind: "timeout" } };
}

export type RefreshState = { message?: string; enquiryHref?: string } | undefined;

/**
 * "Refresh hold": cancelHeld, then a normal fresh acquire of the same cart with the price the
 * guest saw, in that order (known limit: the last unit can go to someone else in between).
 */
export async function refreshHold(_: RefreshState, formData: FormData): Promise<RefreshState> {
  const parsed = refSchema.safeParse(formData.get("ref"));
  const guest = await requireRole("guest");
  if (!parsed.success) return { message: "We could not find this booking." };
  const b = await ownBooking(parsed.data);
  if (!b) return { message: "We could not find this booking." };
  if (b.status === "CONFIRMED") redirect(confirmationHref(b.ref));

  const { stay, lines } = cartFromBooking(b);
  if (b.status === "HELD") {
    // The server rechecks the rule the button follows: refresh only in the last 2 minutes.
    if (payGate(b, Date.now()) === "open")
      return {
        message: "Your hold still has time. Pay now; refresh is offered in the last 2 minutes.",
      };
    const cancelled = await booking.cancelHeld(
      { bookingId: b.id },
      { userId: guest.id, role: "guest" },
    );
    if (!cancelled.ok && cancelled.code === "NOT_HELD" && cancelled.status === "CONFIRMED")
      redirect(confirmationHref(b.ref));
  }
  // Double hold guard (as holdStay): another tab, or a replay of an old ref, may already have
  // taken the fresh hold for this priced stay. Reuse it instead of holding the stock twice.
  const listed = await booking.listForGuest({ guestId: guest.id, limit: 50 });
  if (listed.ok) {
    const again = reusableHold(
      listed.bookings.filter((x) => x.id !== b.id),
      { checkIn: b.checkIn, checkOut: b.checkOut, quoteHash: b.quoteHash },
      Date.now(),
    );
    if (again) redirect(`/book/pay/${encodeURIComponent(again.ref)}`);
  }
  const held = await acquireBookingHold({
    stay: {
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      promoCode: stay.promo,
      rooms: lines,
    },
    quoteHash: b.quoteHash,
  });
  const step = holdStep(held, stay, lines);
  if (step.kind === "pay") redirect(`/book/pay/${encodeURIComponent(step.ref)}`);
  if (step.kind === "rooms") redirect(step.href);
  // The details step sees the old hash, shows the new price and holds at it on request.
  if (step.kind === "price-changed") redirect(detailsHref(stay, lines, b.quoteHash));
  if (step.kind === "window") return { message: step.message };
  return { message: "We could not hold your rooms again. Please build the stay again." };
}
