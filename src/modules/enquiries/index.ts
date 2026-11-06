/**
 * FROZEN CONTRACT (C1). Stub returns fixtures until Q1.
 * ingest() saves the row with ai_status='pending' BEFORE any AI call.
 */
import { z } from "zod";
import type { Err, Ok } from "@/lib/result";
import { enquiriesFixture } from "./fixtures";

export const enquiryChannelSchema = z.enum(["web", "email", "whatsapp", "event_form"]);
export type EnquiryChannel = z.infer<typeof enquiryChannelSchema>;

export const ingestInputSchema = z.object({
  channel: enquiryChannelSchema,
  senderName: z.string().trim().min(1).max(120),
  /** Email address or phone number. Never sent to an AI provider. */
  senderContact: z.string().trim().min(3).max(200),
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

export const enquiries = {
  async ingest(input: IngestInput): Promise<IngestResult> {
    const parsed = ingestInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    return { ok: true, enquiryId: "ENQ-4413", aiStatus: "pending" };
  },
  async list(): Promise<Enquiry[]> {
    return enquiriesFixture;
  },
};
