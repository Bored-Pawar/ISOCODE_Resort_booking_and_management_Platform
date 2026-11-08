import { formatStay } from "@/lib/dates";
import { formatInr } from "@/lib/money";
import { site } from "@/lib/site";
import type { Booking } from "@/modules/booking";
import type { RoomType } from "@/modules/catalog";
import { CHECK_IN_NOTE, confirmationEmail, confirmationLines } from "../_lib/confirmation";

/**
 * The confirmation email as the guest would receive it (B8 mock email). Nothing is sent: there is
 * no outbox table, so this view is derived from the confirmed booking (06 decision).
 */
export function ConfirmationEmailView({
  booking: b,
  types,
  guest,
}: {
  booking: Booking;
  types: RoomType[];
  guest: { name: string; email: string };
}) {
  const mail = confirmationEmail(b, types, guest);
  const lines = confirmationLines(b, types);
  return (
    <article className="overflow-hidden rounded-card border border-border bg-surface">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 border-b border-border bg-surface-2 px-5 py-3 text-small">
        <dt className="text-muted">To</dt>
        <dd className="truncate">{mail.to}</dd>
        <dt className="text-muted">Subject</dt>
        <dd className="font-semibold">{mail.subject}</dd>
      </dl>
      <div className="flex flex-col gap-4 px-5 py-6 text-body">
        <p>Hello {guest.name || "there"},</p>
        <p>Your stay at {site.name} is confirmed.</p>
        <p>
          Booking reference <span className="font-semibold tabular-nums">{b.ref}</span>
          <br />
          {formatStay(b.checkIn, b.checkOut)}
        </p>
        <ul className="flex flex-col gap-1 text-small">
          {lines.map((l) => (
            <li key={l.title} className="flex justify-between gap-3 tabular-nums">
              <span>
                {l.title}, {l.plan.toLowerCase()}, {l.party}
              </span>
              <span>{formatInr(l.totalPaise)}</span>
            </li>
          ))}
        </ul>
        <p className="tabular-nums">
          Total paid <span className="font-semibold">{formatInr(b.totalPaise)}</span> incl.{" "}
          {formatInr(b.gstPaise)} GST
        </p>
        <p className="text-small text-muted">{CHECK_IN_NOTE}</p>
        <p className="text-small text-muted">
          {site.name}, {site.tagline}
        </p>
      </div>
    </article>
  );
}
