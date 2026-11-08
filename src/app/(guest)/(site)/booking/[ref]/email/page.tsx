import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ButtonLink, Skeleton } from "@/components/ui";
import { catalog } from "@/modules/catalog";
import { ConfirmationEmailView } from "../../../../_components/confirmation-email";
import { loadOwnBooking } from "../../../../_lib/own-booking";

export const metadata: Metadata = { title: "Confirmation email", robots: { index: false } };

type Params = Promise<{ ref: string }>;

/** B8 mock email: the confirmation email rendered for its owner. Nothing is sent. */
async function Email({ params }: { params: Params }) {
  const { ref } = await params;
  const { user, booking: b } = await loadOwnBooking(
    ref,
    `/booking/${encodeURIComponent(ref)}/email`,
  );
  if (b.status !== "CONFIRMED") notFound();
  const types = await catalog.listRoomTypes();
  return (
    <>
      <ConfirmationEmailView
        booking={b}
        types={types}
        guest={{ name: user.name, email: user.email }}
      />
      <ButtonLink
        href={`/booking/${encodeURIComponent(b.ref)}`}
        variant="secondary"
        className="mt-6"
      >
        Back to your booking
      </ButtonLink>
    </>
  );
}

export default function EmailPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-read px-4 py-10 md:px-8">
      <h1 className="mb-1 font-display text-h1 font-medium">Confirmation email</h1>
      <p className="mb-6 text-small text-muted">
        Test mode: this is the email we would send. No email is sent yet.
      </p>
      <Suspense fallback={<Skeleton className="h-96 rounded-card" />}>
        <Email params={params} />
      </Suspense>
    </main>
  );
}
