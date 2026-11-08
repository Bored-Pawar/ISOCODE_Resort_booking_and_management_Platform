import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge, Card, Skeleton } from "@/components/ui";
import { getGuestContacts } from "@/lib/auth/profile";
import { formatStay } from "@/lib/dates";
import { formatInr } from "@/lib/money";
import { booking } from "@/modules/booking";
import { catalog } from "@/modules/catalog";
import { confirmationLines } from "@/app/(guest)/_lib/confirmation";
import { PageGate } from "../../_components/page-gate";
import { requireBookingStaff } from "../_lib/access";
import { STATUS_TONE } from "../_lib/filters";

export const metadata = { title: "Booking" };

type Params = Promise<{ ref: string }>;

const at = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Asia/Kolkata",
});

async function Detail({ params }: { params: Params }) {
  const { ref } = await params;
  const { actor } = await requireBookingStaff();
  const got = await booking.getForStaff({ ref }, actor);
  if (!got.ok) notFound();
  const { booking: b, events, payments } = got;
  const [types, contacts] = await Promise.all([
    catalog.listRoomTypes(),
    getGuestContacts([b.guestId]),
  ]);
  const guest = contacts.get(b.guestId);
  const lines = confirmationLines(b, types);
  return (
    <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-3">
            <span className="text-h2 font-semibold tabular-nums">{b.ref}</span>
            <Badge tone={STATUS_TONE[b.status]}>{b.status.toLowerCase()}</Badge>
          </p>
          <p className="text-body">{formatStay(b.checkIn, b.checkOut)}</p>
          <p className="text-small text-muted">
            {guest ? `${guest.name}, ${guest.email}` : "Unknown guest"}
          </p>
          {b.holdExpiresAt ? (
            <p className="text-small text-muted">
              Hold until {at.format(new Date(b.holdExpiresAt))}
            </p>
          ) : null}
        </Card>
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-small tabular-nums">
            <thead className="bg-surface-2 text-left">
              <tr className="h-11">
                <th className="px-3 font-semibold">Room</th>
                <th className="px-3 font-semibold">Plan, party</th>
                <th className="px-3 text-right font-semibold">Subtotal</th>
                <th className="px-3 text-right font-semibold">Discount</th>
                <th className="px-3 text-right font-semibold">GST</th>
                <th className="px-3 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.title} className="h-11 border-t border-border">
                  <td className="px-3">{l.title}</td>
                  <td className="px-3">
                    {l.plan}, {l.party}
                  </td>
                  <td className="px-3 text-right">{formatInr(l.subtotalPaise)}</td>
                  <td className="px-3 text-right">{formatInr(l.discountPaise)}</td>
                  <td className="px-3 text-right">{formatInr(l.gstPaise)}</td>
                  <td className="px-3 text-right">{formatInr(l.totalPaise)}</td>
                </tr>
              ))}
              <tr className="h-11 border-t border-border font-semibold">
                <td className="px-3" colSpan={2}>
                  Order{b.promoCode ? ` (promo ${b.promoCode})` : ""}
                </td>
                <td className="px-3 text-right">{formatInr(b.subtotalPaise)}</td>
                <td className="px-3 text-right">{formatInr(b.discountPaise)}</td>
                <td className="px-3 text-right">{formatInr(b.gstPaise)}</td>
                <td className="px-3 text-right">{formatInr(b.totalPaise)}</td>
              </tr>
            </tbody>
          </table>
        </Card>
        <section aria-labelledby="payments">
          <h2 id="payments" className="text-h2">
            Payments
          </h2>
          {payments.length ? (
            <ul className="mt-2 flex flex-col gap-2 text-small">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3">
                  <Badge tone={p.status === "SUCCESS" ? "success" : "warning"}>
                    {p.status.toLowerCase().replace("_", " ")}
                  </Badge>
                  <span className="tabular-nums">{formatInr(p.amountPaise)}</span>
                  <span className="font-mono text-xs text-muted">{p.providerPaymentId}</span>
                  <span className="text-muted">{at.format(new Date(p.createdAt))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-small text-muted">No payments recorded.</p>
          )}
        </section>
      </div>
      <section aria-labelledby="timeline">
        <h2 id="timeline" className="text-h2">
          Timeline
        </h2>
        <ol className="mt-3 flex flex-col gap-3 border-l border-border pl-4">
          {events.map((e, i) => (
            <li key={i} className="text-small">
              <p className="font-semibold">
                {e.fromStatus ? `${e.fromStatus.toLowerCase()} → ` : ""}
                {e.toStatus?.toLowerCase() ?? ""}
              </p>
              <p>{e.note}</p>
              <p className="text-muted">
                {at.format(new Date(e.at))} · {e.actor.startsWith("guest:") ? "guest" : e.actor}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default function StaffBookingPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="mt-4 h-96 rounded-card" />}>
      <PageGate cap="bookings.view">
        <Link
          href="/admin/bookings"
          className="inline-flex h-11 items-center gap-2 text-small font-semibold text-accent hover:underline"
        >
          <ArrowLeft className="size-[18px]" strokeWidth={1.5} aria-hidden />
          All bookings
        </Link>
        <Suspense fallback={<Skeleton className="mt-4 h-96 rounded-card" />}>
          <Detail params={params} />
        </Suspense>
      </PageGate>
    </Suspense>
  );
}
