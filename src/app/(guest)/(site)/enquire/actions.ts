"use server";

import { CONSENT_VERSION } from "@/lib/consent";
import { todayIST } from "@/lib/dates";
import { catalog } from "@/modules/catalog";
import { enquiries } from "@/modules/enquiries";
import { buildEnquirySchema, composeRawText } from "../../_lib/enquiry-schema";

export type EnquiryFormState =
  | undefined
  | {
      error?: string;
      fieldErrors?: Record<string, string>;
      /** Echoed back so the form keeps what the guest typed after a validation error. */
      values?: Record<string, string>;
      /** Set on success. `enquiryId` is empty for honeypot hits. */
      sent?: { enquiryId: string };
    };

const TEXT_FIELDS = [
  "name",
  "contact",
  "message",
  "checkIn",
  "checkOut",
  "adults",
  "children",
  "room",
  "rooms",
] as const;

// Public entry point (like sign up): Zod validated, no role to require. Spam control beyond the
// honeypot (rate limiting) is deferred to H2.
export async function submitEnquiryAction(
  _: EnquiryFormState,
  formData: FormData,
): Promise<EnquiryFormState> {
  const raw: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") raw[k] = v;
  const values: Record<string, string> = {};
  for (const k of TEXT_FIELDS) values[k] = raw[k] ?? "";

  const parsed = buildEnquirySchema(todayIST()).safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values };
  }
  const form = parsed.data;
  if (form.website) return { sent: { enquiryId: "" } }; // honeypot: look successful, store nothing

  let roomName: string | undefined;
  if (form.room) {
    try {
      roomName = (await catalog.getRoomTypeBySlug(form.room))?.name;
    } catch {
      roomName = undefined; // context only; never block an enquiry on it
    }
  }

  try {
    const result = await enquiries.ingestFrom(
      {
        channel: "web",
        senderName: form.name,
        senderContact: form.contact,
        rawText: composeRawText(form, roomName),
      },
      { consentVersion: CONSENT_VERSION },
    );
    if (!result.ok) return { error: "Please check your details and try again.", values };
    return { sent: { enquiryId: result.enquiryId } };
  } catch (err) {
    // Name only: messages can echo the contact details.
    console.error("web enquiry failed", err instanceof Error ? err.name : "unknown");
    return { error: "We could not send your enquiry. Please try again in a moment.", values };
  }
}
