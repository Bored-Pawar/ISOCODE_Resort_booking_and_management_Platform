import { Suspense } from "react";
import { Mail } from "lucide-react";
import { EmptyState, Skeleton } from "@/components/ui";
import { getGuestContacts } from "@/lib/auth/profile";
import { booking } from "@/modules/booking";
import { catalog } from "@/modules/catalog";
import { ConfirmationEmailView } from "@/app/(guest)/_components/confirmation-email";
import { RetryError } from "@/app/(guest)/_components/retry-error";
import { DevGate } from "../_components/dev-gate";
import { requireDevStaff } from "../_lib/access";

export const metadata = { title: "Outbox" };

/**
 * Derived mock outbox (B8): there is no outbox table, so this lists the last 20 confirmed bookings
 * with the confirmation email each would have sent. Nothing is ever sent (06 decision).
 */
async function Outbox() {
  const staff = await requireDevStaff();
  let result;
  let types;
  let contacts;
  try {
    result = await booking.listForStaff(
      { status: "CONFIRMED", limit: 20 },
      { userId: staff.id, role: staff.role },
    );
    [types, contacts] = await Promise.all([
      catalog.listRoomTypes(),
      getGuestContacts(result.ok ? result.bookings.map((b) => b.guestId) : []),
    ]);
  } catch (error) {
    console.error("dev outbox failed", error);
    return <RetryError title="We could not load the outbox" message="Please try again." />;
  }
  if (!result.ok)
    return (
      <EmptyState
        icon={<Mail strokeWidth={1.5} />}
        message="Your role cannot read bookings. Sign in as reservations or gm."
      />
    );
  const list = result.bookings;
  if (!list.length)
    return (
      <EmptyState
        icon={<Mail strokeWidth={1.5} />}
        message="No confirmed bookings yet. Pay for a test booking to see its email here."
      />
    );
  return (
    <ul className="flex flex-col gap-6">
      {list.map((b) => (
        <li key={b.id}>
          <ConfirmationEmailView
            booking={b}
            types={types}
            guest={contacts.get(b.guestId) ?? { name: "", email: "(unknown guest)" }}
          />
        </li>
      ))}
    </ul>
  );
}

export default function OutboxPage() {
  return (
    <DevGate>
      <main className="mx-auto max-w-read px-4 py-10 md:px-8">
        <h1 className="text-h1 font-medium">Outbox</h1>
        <p className="mt-1 mb-6 text-body text-muted">
          Confirmation emails for the last 20 confirmed bookings. Derived, never sent.
        </p>
        <Suspense fallback={<Skeleton className="h-96 rounded-card" />}>
          <Outbox />
        </Suspense>
      </main>
    </DevGate>
  );
}
