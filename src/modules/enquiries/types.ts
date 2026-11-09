import { z } from "zod";
import type { Err, Ok } from "@/lib/result";
import { isUsableContact } from "./contact";

export const enquiryChannelSchema = z.enum(["web", "email", "whatsapp", "event_form"]);
export type EnquiryChannel = z.infer<typeof enquiryChannelSchema>;

export const ingestInputSchema = z.object({
  channel: enquiryChannelSchema,
  senderName: z.string().trim().min(1).max(120),
  /** Email address or phone number. Never sent to an AI provider. */
  senderContact: z.string().trim().min(3).max(200).refine(isUsableContact),
  rawText: z.string().trim().min(5).max(5000),
});
export type IngestInput = z.input<typeof ingestInputSchema>;

export type IngestResult = Ok<{ enquiryId: string; aiStatus: "pending" }> | Err<"INVALID_INPUT">;

export type EnquiryCategory = "room" | "wedding" | "offsite" | "complaint" | "other";
export type AiStatus = "pending" | "processing" | "ok" | "fallback" | "failed";

export type Enquiry = {
  id: string;
  channel: EnquiryChannel;
  senderName: string;
  senderContact: string;
  rawText: string;
  receivedAt: string;
  category: EnquiryCategory | null;
  confidence: number | null;
  aiStatus: AiStatus;
  lane: "sorted" | "unsorted";
  ownerRole: "reservations" | "sales" | "gm" | null;
  status: "new" | "assigned" | "replied" | "closed";
  isComplaint: boolean;
  summary: string | null;
};

/**
 * ADDITIVE (Q1/Q3), not part of the C1 contract: the idempotency key for webhooks and the consent
 * record for the web form. `ingest()` itself is unchanged.
 */
export type IngestMetaInput = {
  source?: { provider: string; messageId: string };
  consentVersion?: string;
  /** Q2: guest's "What is it about?" choice, stored as `extracted.guest_hint` (a hint only). */
  guestHint?: "stay" | "wedding" | "offsite" | "other";
  /** Q2 (absorbs Q9): event fields saved to `event_details` in the same transaction. */
  event?: {
    eventType: "wedding" | "offsite";
    dateFrom: string | null;
    dateTo: string | null;
    guests: number | null;
    budgetPaise: number | null;
    needs: ("rooms" | "catering" | "decor" | "conference hall")[];
  };
};
export type IngestFromResult =
  Ok<{ enquiryId: string; aiStatus: "pending"; duplicate: boolean }> | Err<"INVALID_INPUT">;
