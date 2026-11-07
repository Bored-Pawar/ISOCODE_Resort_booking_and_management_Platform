/**
 * FROZEN CONTRACT (C1), real since Q1.
 * ingest() saves the row with ai_status='pending' BEFORE any AI call.
 * `ingestFrom()` is an additive sibling (same row, plus webhook idempotency and consent record).
 */
import { saveEnquiry, listEnquiries, type IngestMeta } from "./store";
import {
  ingestInputSchema,
  type Enquiry,
  type IngestFromResult,
  type IngestInput,
  type IngestResult,
} from "./types";

export * from "./types";

const DEFAULT_LIST_LIMIT = 200;

async function ingestWith(input: IngestInput, meta: IngestMeta): Promise<IngestFromResult> {
  const parsed = ingestInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const { enquiryId, duplicate } = await saveEnquiry(parsed.data, meta);
  return { ok: true, enquiryId, aiStatus: "pending", duplicate };
}

export const enquiries = {
  async ingest(input: IngestInput): Promise<IngestResult> {
    const r = await ingestWith(input, {});
    return r.ok ? { ok: true, enquiryId: r.enquiryId, aiStatus: "pending" } : r;
  },
  /** Additive: webhooks pass `source` (idempotent on the provider message id); the form passes consent. */
  ingestFrom(input: IngestInput, meta: IngestMeta = {}): Promise<IngestFromResult> {
    return ingestWith(input, meta);
  },
  /** Newest first. `limit` is optional and additive; the default keeps the inbox bounded. */
  list(opts: { limit?: number } = {}): Promise<Enquiry[]> {
    return listEnquiries(Math.min(Math.max(opts.limit ?? DEFAULT_LIST_LIMIT, 1), 500));
  },
};

export * from "./inbound";
export { handleInbound } from "./inbound-route";
