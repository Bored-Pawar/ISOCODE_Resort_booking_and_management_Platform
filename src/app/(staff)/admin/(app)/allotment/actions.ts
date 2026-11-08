"use server";

import {
  admin,
  fieldErrors,
  setAllotmentInputSchema,
  setOfflineInputSchema,
  setOnlineInputSchema,
  type SetAllotmentResult,
  type SetOfflineResult,
  type SetOnlineResult,
} from "@/modules/admin";
import { actionActor } from "../_lib/access";
import { safeError } from "@/lib/log";

/** A2 single cell or bulk set. `allotment.edit` checked first; the service checks it again. */
export async function setAllotmentAction(input: unknown): Promise<SetAllotmentResult> {
  const actor = await actionActor("allotment.edit");
  if (!actor) return { ok: false, code: "FORBIDDEN" };
  const parsed = setAllotmentInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "INVALID_INPUT", errors: fieldErrors(parsed.error) };
  try {
    return await admin.setAllotment(parsed.data, actor);
  } catch (error) {
    console.error("setAllotment failed", safeError(error));
    return { ok: false, code: "INVALID_INPUT", errors: { form: "Could not save. Try again." } };
  }
}

/** A3 warning list: live bookings on these dates (they stand). `availability.toggle` first. */
export async function bookingsInRangeAction(input: unknown) {
  const actor = await actionActor("availability.toggle");
  if (!actor) return { ok: false, code: "FORBIDDEN" } as const;
  const parsed = setOnlineInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "INVALID_INPUT", errors: fieldErrors(parsed.error) } as const;
  try {
    return await admin.bookingsInRange(parsed.data, actor);
  } catch (error) {
    console.error("bookingsInRange failed", safeError(error));
    return {
      ok: false,
      code: "INVALID_INPUT",
      errors: { form: "Could not load bookings. Try again." },
    } as const;
  }
}

/** A3 take offline (blackout with a reason). */
export async function setOfflineAction(input: unknown): Promise<SetOfflineResult> {
  const actor = await actionActor("availability.toggle");
  if (!actor) return { ok: false, code: "FORBIDDEN" };
  const parsed = setOfflineInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "INVALID_INPUT", errors: fieldErrors(parsed.error) };
  try {
    return await admin.setOffline(parsed.data, actor);
  } catch (error) {
    console.error("setOffline failed", safeError(error));
    return { ok: false, code: "INVALID_INPUT", errors: { form: "Could not save. Try again." } };
  }
}

/** A3 bring online (delete, trim or split blackouts). */
export async function setOnlineAction(input: unknown): Promise<SetOnlineResult> {
  const actor = await actionActor("availability.toggle");
  if (!actor) return { ok: false, code: "FORBIDDEN" };
  const parsed = setOnlineInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "INVALID_INPUT", errors: fieldErrors(parsed.error) };
  try {
    return await admin.setOnline(parsed.data, actor);
  } catch (error) {
    console.error("setOnline failed", safeError(error));
    return { ok: false, code: "INVALID_INPUT", errors: { form: "Could not save. Try again." } };
  }
}
