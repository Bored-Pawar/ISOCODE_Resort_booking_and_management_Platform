import type { Metadata } from "next";
import { Suspense } from "react";
import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ButtonLink, Card, Skeleton, StepIndicator } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { formatInr } from "@/lib/money";
import { booking } from "@/modules/booking";
import { catalog } from "@/modules/catalog";
import { stayHref } from "../../../../_lib/cart";
import { cartFromBooking, PAY_COPY, payGate } from "../../../../_lib/pay-flow";
import { PayPanel } from "../../../../_components/pay-panel";
import { RetryError } from "../../../../_components/retry-error";
import { StaySummary } from "../../../../_components/stay-summary";
import { safeError } from "@/lib/log";

export const metadata: Metadata = { title: "Pay", robots: { index: false } };

type Params = Promise<{ ref: string }>;

/** Request-time clock (the page already opted into request time with connection()). */
function gateNow(b: Parameters<typeof payGate>[0]) {
  return payGate(b, Date.now());
}

/** B6 step 3. Owner only, through booking.get with the session actor; a ref alone grants nothing. */
async function Pay({ params }: { params: Params }) {
  const { ref } = await params;
  await connection();
  const user = await getSessionUser();
  const self = `/book/pay/${encodeURIComponent(ref)}`;
  if (!user || user.role !== "guest") redirect(`/login?next=${encodeURIComponent(self)}`);

  let got;
  let types;
  try {
    [got, types] = await Promise.all([
      booking.get({ ref }, { userId: user.id, role: "guest" }),
      catalog.listRoomTypes(),
    ]);
  } catch (error) {
    console.error("pay step failed", safeError(error));
    return (
      <RetryError
        title="We could not load your booking"
        message="Something went wrong on our side. Nothing has been charged. Please try again."
      />
    );
  }
  // Someone else's ref looks exactly like a missing one.
  if (!got.ok) notFound();
  const b = got.booking;
  if (b.status === "CONFIRMED") redirect(`/booking/${encodeURIComponent(b.ref)}`);
  const { stay, lines } = cartFromBooking(b);
  const rebuildHref = stayHref(stay, lines);
  const summary = (
    <>
      <StaySummary
        placement="mobile"
        types={types}
        checkIn={b.checkIn}
        checkOut={b.checkOut}
        lines={b.rooms}
        totalPaise={b.totalPaise}
        gstPaise={b.gstPaise}
        discountPaise={b.discountPaise}
        promoCode={b.promoCode}
      />
    </>
  );

  if (gateNow(b) === "ended") {
    return (
      <Card className="mt-6 flex max-w-read flex-col items-start gap-3">
        <p className="text-body">{PAY_COPY.ended}</p>
        <ButtonLink href={rebuildHref}>Build the stay again</ButtonLink>
      </Card>
    );
  }

  return (
    <>
      <div className="mt-6">{summary}</div>
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="flex min-w-0 flex-col gap-4">
          <div>
            <h2 className="font-display text-h2 font-medium">Pay {formatInr(b.totalPaise)}</h2>
            <p className="text-small text-muted tabular-nums">
              Booking {b.ref}, incl. {formatInr(b.gstPaise)} GST
            </p>
          </div>
          <PayPanel
            bookingRef={b.ref}
            totalPaise={b.totalPaise}
            holdExpiresAt={b.holdExpiresAt!}
            initialAttemptId={randomUUID()}
            rebuildHref={rebuildHref}
          />
        </Card>
        <StaySummary
          placement="desktop"
          types={types}
          checkIn={b.checkIn}
          checkOut={b.checkOut}
          lines={b.rooms}
          totalPaise={b.totalPaise}
          gstPaise={b.gstPaise}
          discountPaise={b.discountPaise}
          promoCode={b.promoCode}
        />
      </div>
    </>
  );
}

export default function PayPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-page px-4 py-8 md:px-8 md:py-12">
      <StepIndicator current={3} />
      <h1 className="mt-3 font-display text-h1 font-medium">Pay for your stay</h1>
      <Suspense
        fallback={
          <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]" role="status">
            <Skeleton className="h-96 rounded-card" />
            <Skeleton className="hidden h-80 rounded-card lg:block" />
          </div>
        }
      >
        <Pay params={params} />
      </Suspense>
    </main>
  );
}
