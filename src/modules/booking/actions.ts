"use server";

import { requireRole } from "@/lib/auth";
import { BOOKING_WINDOW_MESSAGE, withinBookingWindow } from "@/lib/booking-window";
import { todayIST } from "@/lib/dates";
import type { Err } from "@/lib/result";
import { booking, acquireHoldInputSchema, type AcquireHoldResult } from "./index";

/**
 * The guest action's result: the frozen service result, plus the guest channel rule that online
 * check-in is at most 3 months ahead (runbook item 1b). The service contract is unchanged.
 */
export type AcquireBookingHoldResult =
  AcquireHoldResult | Err<"OUTSIDE_WINDOW", { message: string }>;

/** Browser payload never supplies the authoritative guest ID. */
export async function acquireBookingHold(input: unknown): Promise<AcquireBookingHoldResult> {
  const guest = await requireRole("guest");
  const parsed = acquireHoldInputSchema.omit({ guestId: true }).safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  if (!withinBookingWindow(parsed.data.stay.checkIn, todayIST()))
    return { ok: false, code: "OUTSIDE_WINDOW", message: BOOKING_WINDOW_MESSAGE };
  return booking.acquireHold({ ...parsed.data, guestId: guest.id });
}
