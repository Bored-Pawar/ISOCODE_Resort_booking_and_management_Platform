"use server";

import { requireRole } from "@/lib/auth";
import { booking, acquireHoldInputSchema, type AcquireHoldResult } from "./index";

/** Browser payload never supplies the authoritative guest ID. */
export async function acquireBookingHold(input: unknown): Promise<AcquireHoldResult> {
  const guest = await requireRole("guest");
  const parsed = acquireHoldInputSchema.omit({ guestId: true }).safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  return booking.acquireHold({ ...parsed.data, guestId: guest.id });
}
