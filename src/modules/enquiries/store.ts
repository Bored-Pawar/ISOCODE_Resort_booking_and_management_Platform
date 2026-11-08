import { desc, eq, sql } from "drizzle-orm";
import { enquiries as enquiriesTable, eventDetails, users } from "@/db/schema";
import { getDb } from "@/lib/db";
import type { Enquiry, EnquiryCategory } from "./types";
import { ingestInputSchema } from "./types";
import { generateEnquiryId } from "./id";
import { normaliseContact, tidyText } from "./normalise";

export type IngestMeta = {
  /** Provider and its own message id: the idempotency key for webhooks. */
  source?: { provider: string; messageId: string };
  /** Recorded when the sender ticked the DPDP consent box. */
  consentVersion?: string;
  /** Q2: the guest's "What is it about?" choice. A hint for staff, never the routing decision. */
  guestHint?: GuestHint;
  /** Q2 (absorbs Q9): structured event fields, saved to `event_details` with the enquiry. */
  event?: EventInput;
};

export const GUEST_HINTS = ["stay", "wedding", "offsite", "other"] as const;
export type GuestHint = (typeof GUEST_HINTS)[number];
export const EVENT_NEEDS = ["rooms", "catering", "decor", "conference hall"] as const;
export type EventInput = {
  eventType: "wedding" | "offsite";
  dateFrom: string | null;
  dateTo: string | null;
  guests: number | null;
  budgetPaise: number | null;
  needs: (typeof EVENT_NEEDS)[number][];
};

const MAX_ID_ATTEMPTS = 6;

/**
 * Saves one enquiry with `ai_status='pending'`. No AI is called here (04: the row exists first).
 * With a `source`, a repeat of the same provider message id returns the original row. A per-key
 * advisory lock makes that safe when the provider retries while the first request is in flight.
 * The key lives in `extracted.source` because the schema has no column for it. R3 must merge into
 * `extracted`, never replace it.
 */
export async function saveEnquiry(
  parsed: ReturnType<typeof ingestInputSchema.parse>,
  meta: IngestMeta = {},
): Promise<{ enquiryId: string; duplicate: boolean }> {
  const row = {
    channel: parsed.channel,
    senderName: parsed.senderName,
    senderContact: normaliseContact(parsed.senderContact),
    rawText: tidyText(parsed.rawText),
    aiStatus: "pending",
    extracted:
      meta.source || meta.consentVersion || meta.guestHint
        ? {
            ...(meta.source ? { source: meta.source } : {}),
            ...(meta.consentVersion
              ? { consent: { version: meta.consentVersion, at: new Date().toISOString() } }
              : {}),
            ...(meta.guestHint ? { guest_hint: meta.guestHint } : {}),
          }
        : null,
  };

  return getDb().transaction(async (tx) => {
    const src = meta.source;
    if (src) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`enquiry-inbound:${src.provider}:${src.messageId}`}, 0))`,
      );
      const [existing] = await tx
        .select({ id: enquiriesTable.id })
        .from(enquiriesTable)
        .where(
          sql`${enquiriesTable.extracted} -> 'source' ->> 'provider' = ${src.provider}
            and ${enquiriesTable.extracted} -> 'source' ->> 'messageId' = ${src.messageId}`,
        )
        .limit(1);
      if (existing) return { enquiryId: existing.id, duplicate: true };
    }
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      const [inserted] = await tx
        .insert(enquiriesTable)
        .values({ id: generateEnquiryId(), ...row })
        .onConflictDoNothing({ target: enquiriesTable.id })
        .returning({ id: enquiriesTable.id });
      if (inserted) {
        if (meta.event)
          await tx.insert(eventDetails).values({ enquiryId: inserted.id, ...meta.event });
        return { enquiryId: inserted.id, duplicate: false };
      }
    }
    throw new Error("Could not allocate a unique enquiry id");
  });
}

const OWNER_ROLES = ["reservations", "sales", "gm"] as const;

export async function listEnquiries(limit: number): Promise<Enquiry[]> {
  const rows = await getDb()
    .select({ e: enquiriesTable, ownerRole: users.role })
    .from(enquiriesTable)
    .leftJoin(users, eq(users.id, enquiriesTable.ownerId))
    .orderBy(desc(enquiriesTable.receivedAt), desc(enquiriesTable.id))
    .limit(limit);
  return rows.map(({ e, ownerRole }) => {
    const extracted = (e.extracted ?? {}) as { summary?: unknown };
    return {
      id: e.id,
      channel: e.channel as Enquiry["channel"],
      senderName: e.senderName,
      senderContact: e.senderContact,
      rawText: e.rawText,
      receivedAt: e.receivedAt.toISOString(),
      category: e.category as EnquiryCategory | null,
      confidence: e.confidence === null ? null : Number(e.confidence),
      aiStatus: e.aiStatus as Enquiry["aiStatus"],
      lane: e.lane as Enquiry["lane"],
      ownerRole: (OWNER_ROLES as readonly (string | null)[]).includes(ownerRole)
        ? (ownerRole as Enquiry["ownerRole"])
        : null,
      status: e.status as Enquiry["status"],
      isComplaint: e.isComplaint,
      summary: typeof extracted.summary === "string" ? extracted.summary : null,
    };
  });
}
