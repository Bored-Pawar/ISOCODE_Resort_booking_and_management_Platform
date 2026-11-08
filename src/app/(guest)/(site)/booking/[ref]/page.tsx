import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarPlus, CircleCheck, Clock, Mail } from "lucide-react";
import { ButtonLink, Card, Skeleton } from "@/components/ui";
import { formatStay } from "@/lib/dates";
import { formatInr } from "@/lib/money";
import { catalog } from "@/modules/catalog";
import { stayHref } from "../../../_lib/cart";
import { CHECK_IN_NOTE, confirmationLines, stateView } from "../../../_lib/confirmation";
import { loadOwnBooking } from "../../../_lib/own-booking";
import { cartFromBooking, payGate } from "../../../_lib/pay-flow";

export const metadata: Metadata = { title: "Your booking", robots: { index: false } };

type Params = Promise<{ ref: string }>;

/** Request-time clock (loadOwnBooking already opted into request time with connection()). */
function holdLive(b: Parameters<typeof payGate>[0]) {
  return payGate(b, Date.now()) !== "ended";
}

/** B8 confirmation (05 screen 5). Owner only; a non-confirmed ref shows its real state. */
async function Confirmation({ params }: { params: Params }) {
  const { ref } = await params;
  const { booking: b } = await loadOwnBooking(ref, `/booking/${encodeURIComponent(ref)}`);
  const types = await catalog.listRoomTypes();
  const view = stateView(b.status, holdLive(b));

  if (b.status !== "CONFIRMED") {
    const { stay, lines } = cartFromBooking(b);
    return (
      <Card className="flex max-w-read flex-col items-start gap-3">
        <p className="flex items-center gap-2 font-display text-h1 font-medium">
          <Clock className="size-7 text-muted" strokeWidth={1.5} aria-hidden />
          {view.title}
        </p>
        <p className="font-display text-h2 tabular-nums">{b.ref}</p>
        <p className="text-body">{formatStay(b.checkIn, b.checkOut)}</p>
        <p className="text-body text-muted">{view.message}</p>
        {view.action === "pay" ? (
          <ButtonLink href={`/book/pay/${encodeURIComponent(b.ref)}`}>Resume payment</ButtonLink>
        ) : view.action === "rebuild" ? (
          <ButtonLink href={stayHref(stay, lines)}>Build the stay again</ButtonLink>
        ) : null}
      </Card>
    );
  }

  const lines = confirmationLines(b, types);
  return (
    <div className="flex max-w-read flex-col gap-8">
      <header className="flex flex-col gap-2">
        <CircleCheck className="size-10 text-success" strokeWidth={1.5} aria-hidden />
        <h1 className="font-display text-display-sm font-medium md:text-display">
          Your stay is confirmed
        </h1>
        <p className="text-small text-muted">Booking reference</p>
        <p className="font-display text-display-sm font-medium tabular-nums">{b.ref}</p>
        <p className="text-body">{formatStay(b.checkIn, b.checkOut)}</p>
      </header>

      <section aria-labelledby="rooms" className="flex flex-col gap-3">
        <h2 id="rooms" className="font-display text-h2 font-medium">
          Your rooms
        </h2>
        {lines.map((l) => (
          <Card key={l.title} className="flex flex-col gap-2">
            <p className="font-semibold">{l.title}</p>
            <p className="text-small text-muted">
              {l.plan}, {l.party}
            </p>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-small tabular-nums">
              <dt className="text-muted">Room</dt>
              <dd className="text-right">{formatInr(l.subtotalPaise)}</dd>
              {l.discountPaise > 0 ? (
                <>
                  <dt className="text-muted">Promo</dt>
                  <dd className="text-right">−{formatInr(l.discountPaise)}</dd>
                </>
              ) : null}
              <dt className="text-muted">GST</dt>
              <dd className="text-right">{formatInr(l.gstPaise)}</dd>
              <dt className="font-semibold">Room total</dt>
              <dd className="text-right font-semibold">{formatInr(l.totalPaise)}</dd>
            </dl>
          </Card>
        ))}
        <p className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
          <span className="font-semibold">
            Total paid{b.promoCode ? ` (promo ${b.promoCode})` : ""}
          </span>
          <span className="text-right">
            <span className="font-display text-h1 font-medium tabular-nums">
              {formatInr(b.totalPaise)}
            </span>
            <span className="block text-small text-muted tabular-nums">
              incl. {formatInr(b.gstPaise)} GST
            </span>
          </span>
        </p>
      </section>

      <p className="rounded-card bg-surface-2 p-4 text-small">{CHECK_IN_NOTE}</p>

      <div className="flex flex-wrap gap-3">
        <ButtonLink href={`/booking/${encodeURIComponent(b.ref)}/ics`} variant="secondary">
          <CalendarPlus className="size-[18px]" strokeWidth={1.5} aria-hidden />
          Add to calendar
        </ButtonLink>
        <ButtonLink href={`/booking/${encodeURIComponent(b.ref)}/email`} variant="ghost">
          <Mail className="size-[18px]" strokeWidth={1.5} aria-hidden />
          View confirmation email
        </ButtonLink>
        <ButtonLink href="/">Back to home</ButtonLink>
      </div>
    </div>
  );
}

export default function BookingPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-page px-4 py-10 md:px-8 md:py-12">
      <Suspense
        fallback={
          <div className="flex max-w-read flex-col gap-4" role="status">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-12 w-80" />
            <Skeleton className="h-40 rounded-card" />
          </div>
        }
      >
        <Confirmation params={params} />
      </Suspense>
    </main>
  );
}
