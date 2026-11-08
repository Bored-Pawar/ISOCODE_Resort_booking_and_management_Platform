"use server";

import {
  admin,
  createPromoInputSchema,
  deactivatePromoInputSchema,
  fieldErrors,
  type CreatePromoResult,
  type DeactivatePromoResult,
} from "@/modules/admin";
import { actionActor } from "../_lib/access";
import { safeError } from "@/lib/log";

/** A4 create. `promos.manage` first; the service checks it again and stores the code uppercase. */
export async function createPromoAction(input: unknown): Promise<CreatePromoResult> {
  const actor = await actionActor("promos.manage");
  if (!actor) return { ok: false, code: "FORBIDDEN" };
  const parsed = createPromoInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "INVALID_INPUT", errors: fieldErrors(parsed.error) };
  try {
    return await admin.createPromo(parsed.data, actor);
  } catch (error) {
    console.error("createPromo failed", safeError(error));
    return { ok: false, code: "INVALID_INPUT", errors: { form: "Could not save. Try again." } };
  }
}

/** A4 deactivate. Confirmed bookings keep their discount; new quotes get PROMO_INVALID. */
export async function deactivatePromoAction(input: unknown): Promise<DeactivatePromoResult> {
  const actor = await actionActor("promos.manage");
  if (!actor) return { ok: false, code: "FORBIDDEN" };
  const parsed = deactivatePromoInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "INVALID_INPUT", errors: fieldErrors(parsed.error) };
  try {
    return await admin.deactivatePromo(parsed.data, actor);
  } catch (error) {
    console.error("deactivatePromo failed", safeError(error));
    return { ok: false, code: "INVALID_INPUT", errors: { form: "Could not save. Try again." } };
  }
}
