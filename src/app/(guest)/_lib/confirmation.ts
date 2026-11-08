/**
 * B8 confirmation: the price breakdown, the calendar file and the mock email, all from the frozen
 * booking snapshot (never re-priced). Pure; types only from modules.
 */
import { formatStay } from "@/lib/dates";
import { formatInr } from "@/lib/money";
import { site } from "@/lib/site";
import type { Booking, BookingStatus } from "@/modules/booking";
import type { RoomType } from "@/modules/catalog";
import { guestsLabel } from "./format";

export const CHECK_IN_NOTE =
  "Foreign guests: please bring your passport. We complete Form C at the desk.";

export type ConfirmationLine = {
  title: string;
  plan: string;
  party: string;
  subtotalPaise: number;
  discountPaise: number;
  gstPaise: number;
  totalPaise: number;
};

export function confirmationLines(b: Booking, types: RoomType[]): ConfirmationLine[] {
  const byId = new Map(types.map((t) => [t.id, t]));
  return b.rooms.map((r, i) => {
    const t = byId.get(r.roomTypeId);
    return {
      title: `Room ${i + 1}: ${t?.name ?? "Room"}`,
      plan: t?.ratePlans.find((p) => p.id === r.ratePlanId)?.name ?? "",
      party: guestsLabel(r.adults, r.children),
      subtotalPaise: r.subtotalPaise,
      discountPaise: r.discountPaise,
      gstPaise: r.gstPaise,
      totalPaise: r.totalPaise,
    };
  });
}

/** What a non-confirmed ref shows instead of a confirmation. Never claims a confirmation. */
export function stateView(
  status: BookingStatus,
  holdLive: boolean,
): { title: string; message: string; action: "pay" | "rebuild" | null } {
  switch (status) {
    case "CONFIRMED":
      return { title: "Your stay is confirmed", message: "", action: null };
    case "HELD":
      return holdLive
        ? {
            title: "Not confirmed yet",
            message: "Your rooms are held but not paid for. Finish paying to confirm the booking.",
            action: "pay",
          }
        : {
            title: "Not confirmed",
            message: "This hold has ended. Your rooms were released.",
            action: "rebuild",
          };
    case "EXPIRED":
      return {
        title: "Not confirmed",
        message: "This hold has ended. Your rooms were released.",
        action: "rebuild",
      };
    case "CANCELLED":
      return { title: "Cancelled", message: "This booking was cancelled.", action: "rebuild" };
  }
}

// ---- calendar ------------------------------------------------------------

function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
const icsDate = (d: string) => d.replaceAll("-", "");

/** RFC 5545 all-day event from check-in to check-out (DTEND is exclusive, like check-out). */
export function confirmationIcs(b: Booking, types: RoomType[], now: Date): string {
  const rooms = confirmationLines(b, types)
    .map((l) => `${l.title}, ${l.plan}, ${l.party}`)
    .join("\n");
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${icsText(site.name)}//Booking//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.ref}@booking.company-a.invalid`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${icsDate(b.checkIn)}`,
    `DTEND;VALUE=DATE:${icsDate(b.checkOut)}`,
    `SUMMARY:${icsText(`Stay at ${site.name} (${b.ref})`)}`,
    `DESCRIPTION:${icsText(`${rooms}\n${CHECK_IN_NOTE}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

// ---- mock email ------------------------------------------------------------

export type ConfirmationEmail = {
  to: string;
  subject: string;
  /** Plain text body; the HTML view renders the same content. */
  text: string;
};

export function confirmationEmail(
  b: Booking,
  types: RoomType[],
  guest: { name: string; email: string },
): ConfirmationEmail {
  const lines = confirmationLines(b, types);
  const text = [
    `Hello ${guest.name || "there"},`,
    "",
    `Your stay at ${site.name} is confirmed.`,
    `Booking reference: ${b.ref}`,
    formatStay(b.checkIn, b.checkOut),
    "",
    ...lines.map(
      (l) =>
        `${l.title}, ${l.plan}, ${l.party}: ${formatInr(l.totalPaise)} incl. ${formatInr(l.gstPaise)} GST`,
    ),
    ...(b.discountPaise > 0
      ? [`Includes promo ${b.promoCode ?? ""}: you save ${formatInr(b.discountPaise)}`]
      : []),
    `Total paid: ${formatInr(b.totalPaise)} incl. ${formatInr(b.gstPaise)} GST`,
    "",
    CHECK_IN_NOTE,
    "",
    `${site.name}, ${site.tagline}`,
  ].join("\n");
  return {
    to: guest.email,
    subject: `Your stay is confirmed: ${b.ref}`,
    text,
  };
}
