/** INTERNAL: transaction-scoped repricing, imported only by booking. Never commits. */
import type { Tx } from "@/lib/db";
import { readQuote } from "./read";
import type { QuoteInput, QuoteResult } from "./types";
import { eq, inArray, sql } from "drizzle-orm";
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

/** Batched promoCodeInTx for booking list reads: one query for any number of promo ids. */
export async function promoCodesInTx(tx: Tx, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await tx
    .select({ id: promoCodes.id, code: promoCodes.code })
    .from(promoCodes)
    .where(inArray(promoCodes.id, ids));
  return new Map(rows.map((r) => [r.id, r.code]));
}

/** Only a successful first confirmation consumes a promo use; the approved max-use overshoot remains. */
export async function recordPromoUseInTx(tx: Tx, id: string): Promise<void> {
  await tx
    .update(promoCodes)
    .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
    .where(eq(promoCodes.id, id));
}
