import { createHash } from "node:crypto";

/**
 * Optimistic version of an unsent draft: its stored body and server quote. The detail page hands
 * it to the client; save and send must return it, so a draft rebuilt or edited by someone else
 * after the page loaded is refused (`STALE_DRAFT`) instead of overwritten or sent with an old
 * price (review MAJOR 2). No schema change: derived from the row itself.
 */
export function draftVersion(body: string, quote: unknown): string {
  return createHash("sha256")
    .update(body)
    .update("\u0000")
    .update(JSON.stringify(quote ?? null))
    .digest("hex")
    .slice(0, 16);
}
