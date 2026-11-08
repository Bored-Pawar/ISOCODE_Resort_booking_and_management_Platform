"use server";

import { CONSENT_VERSION } from "@/lib/consent";
import { allow, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { todayIST } from "@/lib/dates";
import { catalog } from "@/modules/catalog";
import { enquiries } from "@/modules/enquiries";
import { buildEnquirySchema, composeRawText, eventInput } from "../../_lib/enquiry-schema";

export type EnquiryFormState =
  | undefined
  | {
      error?: string;
      fieldErrors?: Record<string, string>;
      /** Echoed back so the form keeps what the guest typed after a validation error. */
      values?: Record<string, string>;
      needs?: string[];
      /** Changes on every failed submit; the form remounts with `key={attempt}`. */
      attempt?: number;
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
  "about",
  "eventFrom",
  "eventTo",
  "eventGuests",
  "budget",
  "consent",
] as const;

// Public entry point (like sign up): Zod validated, no role to require. Spam control: the honeypot
// plus an in-memory rate limit per IP and per contact (H2, per instance).
export async function submitEnquiryAction(
  prev: EnquiryFormState,
  formData: FormData,
): Promise<EnquiryFormState> {
  const result = await submit(formData);
  return result?.sent ? result : { ...result, attempt: (prev?.attempt ?? 0) + 1 };
}

async function submit(formData: FormData): Promise<EnquiryFormState> {
  const raw: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") raw[k] = v;
  const values: Record<string, string> = {};
  for (const k of TEXT_FIELDS) values[k] = raw[k] ?? "";
  const needs = formData.getAll("needs").filter((v): v is string => typeof v === "string");

  const parsed = buildEnquirySchema(todayIST()).safeParse({ ...raw, needs });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values, needs };
  }
  const form = parsed.data;
  if (form.website) return { sent: { enquiryId: "" } }; // honeypot: look successful, store nothing
  if (!(await allow("enquiry", form.contact)))
    return { error: RATE_LIMITED_MESSAGE, values, needs };

  let roomName: string | undefined;
  if (form.room) {
    try {
      roomName = (await catalog.getRoomTypeBySlug(form.room))?.name;
    } catch {
      roomName = undefined; // context only; never block an enquiry on it
    }
  }

  const event = eventInput(form);
  try {
    const result = await enquiries.ingestFrom(
      {
        // 2.7: the existing `event_form` channel when event fields are filled, `web` otherwise.
        channel: event ? "event_form" : "web",
        senderName: form.name,
        senderContact: form.contact,
        rawText: composeRawText(form, roomName),
      },
      {
        consentVersion: CONSENT_VERSION,
        ...(form.about ? { guestHint: form.about } : {}),
        ...(event ? { event } : {}),
      },
    );
    if (!result.ok) return { error: "Please check your details and try again.", values, needs };
    return { sent: { enquiryId: result.enquiryId } };
  } catch (err) {
    // Name only: messages can echo the contact details.
    console.error("web enquiry failed", err instanceof Error ? err.name : "unknown");
    return {
      error: "We could not send your enquiry. Please try again in a moment.",
      values,
      needs,
    };
  }
}
