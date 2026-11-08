"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { updateGuestPhone } from "@/lib/auth/profile";
import { phoneField } from "@/lib/auth/sign-up-schema";
import { acquireBookingHold } from "@/modules/booking/actions";
import { parseCartParams } from "../../_lib/cart";
import { holdStep, type HoldStep } from "../../_lib/hold-flow";

export type HoldFormState = { step?: HoldStep; phoneError?: string } | undefined;

const holdFormSchema = z.object({
  /** The /book/details query string: dates, group, cart, promo and the quoteHash shown. */
  query: z.string().min(1).max(2000),
  /** Present only when the guest edited it; empty clears it. */
  phone: z.string().max(40).nullable(),
  /** What the profile had, so an untouched field writes nothing. */
  phoneBefore: z.string().max(40).nullable(),
});

/** Same parser as /rooms and /book/details. */
function readQuery(query: string) {
  const params = new URLSearchParams(query);
  const raw = {
    checkIn: params.get("checkIn") ?? undefined,
    checkOut: params.get("checkOut") ?? undefined,
    adults: params.get("adults") ?? undefined,
    children: params.get("children") ?? undefined,
    promo: params.get("promo") ?? undefined,
    room: params.getAll("room"),
  };
  return { cart: parseCartParams(raw), quoteHash: params.get("quoteHash") ?? "" };
}

/**
 * B6 step 2 submit: "Hold my rooms". Zod first, then the guest session (the guest id never comes
 * from the browser). acquireBookingHold rechecks the 3 month window; acquireHold reuses a live
 * hold for this guest and exact stay inside its transaction (back button, double submit, two
 * tabs). Held goes to the pay page; stock and price problems go back to /rooms with the cart.
 */
export async function holdStay(_: HoldFormState, formData: FormData): Promise<HoldFormState> {
  const parsed = holdFormSchema.safeParse({
    query: formData.get("query"),
    phone: formData.get("phone"),
    phoneBefore: formData.get("phoneBefore"),
  });
  const guest = await requireRole("guest");
  if (!parsed.success) return { step: { kind: "error" } };
  const { cart, quoteHash } = readQuery(parsed.data.query);
  if (!cart.checkIn || !cart.checkOut || !cart.lines.length || !quoteHash || cart.dropped)
    return { step: { kind: "error" } };

  if (parsed.data.phone !== null && parsed.data.phone.trim() !== (parsed.data.phoneBefore ?? "")) {
    const phone = phoneField.safeParse(parsed.data.phone);
    if (!phone.success) return { phoneError: phone.error.issues[0]?.message };
    await updateGuestPhone(guest.id, phone.data ?? null);
  }

  const result = await acquireBookingHold({
    stay: {
      checkIn: cart.checkIn,
      checkOut: cart.checkOut,
      promoCode: cart.promo || undefined,
      rooms: cart.lines,
    },
    quoteHash,
  });
  const stay = {
    checkIn: cart.checkIn,
    checkOut: cart.checkOut,
    ...cart.party,
    promo: cart.promo,
  };
  const step = holdStep(result, stay, cart.lines);
  if (step.kind === "pay") redirect(`/book/pay/${encodeURIComponent(step.ref)}`);
  if (step.kind === "rooms") redirect(step.href);
  return { step };
}
