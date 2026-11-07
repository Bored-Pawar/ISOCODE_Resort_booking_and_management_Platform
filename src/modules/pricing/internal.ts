/** INTERNAL: transaction-scoped repricing, imported only by booking. Never commits. */
import type { Tx } from "@/lib/db";
import { readQuote } from "./read";
import type { QuoteInput, QuoteResult } from "./types";

export async function quoteInTx(tx: Tx, input: QuoteInput): Promise<QuoteResult> {
  return readQuote(tx, input);
}
