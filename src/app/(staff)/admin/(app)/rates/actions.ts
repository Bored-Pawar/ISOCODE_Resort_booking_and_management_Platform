"use server";

import { admin, setRatesInputSchema, fieldErrors, type SetRatesResult } from "@/modules/admin";
import { actionActor } from "../_lib/access";

/** A1 single cell or bulk set. `rates.edit` checked first; the service checks it again. */
export async function setRatesAction(input: unknown): Promise<SetRatesResult> {
  const actor = await actionActor("rates.edit");
  if (!actor) return { ok: false, code: "FORBIDDEN" };
  const parsed = setRatesInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "INVALID_INPUT", errors: fieldErrors(parsed.error) };
  try {
    return await admin.setRates(parsed.data, actor);
  } catch (error) {
    console.error("setRates failed", error);
    return { ok: false, code: "INVALID_INPUT", errors: { form: "Could not save. Try again." } };
  }
}
