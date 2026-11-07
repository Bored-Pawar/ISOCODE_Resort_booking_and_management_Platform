/** INTERNAL: transaction-scoped repricing, imported only by booking. Never commits. */
import type { Tx } from "@/lib/db";
import { readQuote } from "./read";
import type { QuoteInput, QuoteResult } from "./types";
import { eq, sql } from "drizzle-orm";
import { promoCodes } from "@/db/schema";

export async function quoteInTx(tx: Tx, input: QuoteInput): Promise<QuoteResult> {
  return readQuote(tx, input);
}

export async function promoIdInTx(tx: Tx, code: string): Promise<string> {
  const [promo] = await tx
    .select({ id: promoCodes.id })
    .from(promoCodes)
    .where(eq(promoCodes.code, code));
  if (!promo) throw new Error("Quoted promo no longer exists");
  return promo.id;
}

export async function promoCodeInTx(tx: Tx, id: string): Promise<string | null> {
  const [promo] = await tx
    .select({ code: promoCodes.code })
    .from(promoCodes)
    .where(eq(promoCodes.id, id));
  return promo?.code ?? null;
}

/** Only a successful first confirmation consumes a promo use; the approved max-use overshoot remains. */
export async function recordPromoUseInTx(tx: Tx, id: string): Promise<void> {
  await tx
    .update(promoCodes)
    .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
    .where(eq(promoCodes.id, id));
}
