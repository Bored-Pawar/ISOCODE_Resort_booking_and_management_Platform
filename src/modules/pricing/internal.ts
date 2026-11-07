/**
 * INTERNAL, transaction-aware pricing helper for the booking module only (R01).
 * Not exported from index.ts and never imported by UI. Signature only until B1.
 * See docs/01-booking-core.md, "Contracts".
 */
import type { Tx } from "@/lib/db";
import type { QuoteInput, QuoteResult } from "./types";

/**
 * Same rules and result as pricing.quote(), but reads rates, slabs and promo inside the caller's
 * transaction so the hold recheck sees one consistent snapshot. Opens no transaction of its own.
 */
export async function quoteInTx(tx: Tx, input: QuoteInput): Promise<QuoteResult> {
  void tx;
  void input;
  throw new Error("pricing.quoteInTx is not implemented (B1)");
}
