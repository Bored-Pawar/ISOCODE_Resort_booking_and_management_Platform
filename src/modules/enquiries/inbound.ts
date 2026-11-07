/**
 * Provider payload adapters for the inbound webhooks (Q3). Pure: no database and no env reads, so
 * they are unit tested. Shapes follow the real providers:
 * - Email: Postmark inbound JSON (From, FromName, Subject, TextBody, MessageID).
 * - WhatsApp: Meta Cloud API webhook (entry[].changes[].value.messages[] and contacts[]).
 */
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { IngestInput } from "./types";

export const INBOUND_SECRET_HEADER = "x-inbound-secret";
export const MAX_INBOUND_BYTES = 256 * 1024;
const MAX_TEXT = 5000;

/** Constant-time compare. Fails closed when no secret is configured or none is sent. */
export function isValidInboundSecret(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type InboundItem = { input: IngestInput; source: { provider: string; messageId: string } };

// ---------- Email (Postmark inbound) ----------

export const postmarkInboundSchema = z.object({
  From: z.string().trim().min(3).max(320),
  FromName: z.string().max(200).optional().nullable(),
  Subject: z.string().max(500).optional().nullable(),
  TextBody: z.string().max(200_000).optional().nullable(),
  MessageID: z.string().trim().min(1).max(200),
});
export type PostmarkInbound = z.infer<typeof postmarkInboundSchema>;

/** "Name <a@b.c>" or "a@b.c" to the bare address. */
export function extractEmailAddress(from: string): string {
  const m = /<([^<>]+)>/.exec(from);
  return (m ? m[1] : from).trim();
}

export function mapPostmarkEmail(p: PostmarkInbound): InboundItem {
  const address = extractEmailAddress(p.From);
  const name = p.FromName?.trim() || address.split("@")[0] || address;
  const subject = p.Subject?.trim() ?? "";
  const body = p.TextBody?.trim() ?? "";
  const text = [subject, body].filter(Boolean).join("\n\n");
  return {
    input: {
      channel: "email",
      senderName: name.slice(0, 120),
      senderContact: address.slice(0, 200),
      rawText: text.slice(0, MAX_TEXT),
    },
    source: { provider: "postmark", messageId: p.MessageID },
  };
}

// ---------- WhatsApp (Meta Cloud API) ----------

const waMessageSchema = z.object({
  id: z.string().trim().min(1).max(200),
  from: z.string().trim().min(5).max(30),
  type: z.string().optional(),
  text: z.object({ body: z.string().max(10_000) }).optional(),
});
const waValueSchema = z.object({
  contacts: z
    .array(
      z.object({
        wa_id: z.string().optional(),
        profile: z.object({ name: z.string().optional() }).optional(),
      }),
    )
    .optional(),
  messages: z.array(waMessageSchema).optional(),
});
export const whatsappInboundSchema = z.object({
  entry: z
    .array(z.object({ changes: z.array(z.object({ value: waValueSchema })).default([]) }))
    .default([]),
});
export type WhatsAppInbound = z.infer<typeof whatsappInboundSchema>;

/**
 * One item per text message. Delivery statuses and non-text messages (images, reactions) are
 * counted as skipped, so the provider still gets a fast 200.
 */
export function mapWhatsApp(p: WhatsAppInbound): { items: InboundItem[]; skipped: number } {
  const items: InboundItem[] = [];
  let skipped = 0;
  for (const entry of p.entry) {
    for (const change of entry.changes) {
      const names = new Map<string, string>();
      for (const c of change.value.contacts ?? []) {
        if (c.wa_id && c.profile?.name) names.set(c.wa_id, c.profile.name);
      }
      for (const m of change.value.messages ?? []) {
        const body = m.text?.body.trim();
        if ((m.type ?? "text") !== "text" || !body) {
          skipped++;
          continue;
        }
        const phone = `+${m.from.replace(/[^0-9]/g, "")}`;
        items.push({
          input: {
            channel: "whatsapp",
            senderName: (names.get(m.from)?.trim() || phone).slice(0, 120),
            senderContact: phone,
            rawText: body.slice(0, MAX_TEXT),
          },
          source: { provider: "whatsapp", messageId: m.id },
        });
      }
    }
  }
  return { items, skipped };
}

// ---------- Payload builders (used by the /dev/test simulator and tests) ----------

export function buildPostmarkPayload(o: {
  fromEmail: string;
  fromName: string;
  subject: string;
  body: string;
  messageId: string;
}): PostmarkInbound {
  return {
    From: o.fromEmail,
    FromName: o.fromName,
    Subject: o.subject,
    TextBody: o.body,
    MessageID: o.messageId,
  };
}

export function buildWhatsAppPayload(o: {
  phone: string;
  name: string;
  body: string;
  messageId: string;
}) {
  const waId = o.phone.replace(/[^0-9]/g, "");
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "SIMULATED",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              contacts: [{ profile: { name: o.name }, wa_id: waId }],
              messages: [
                {
                  from: waId,
                  id: o.messageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: o.body },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
