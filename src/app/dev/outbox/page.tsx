import { Suspense } from "react";
import Link from "next/link";
import { Mail, MessageSquareReply } from "lucide-react";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { inbox } from "@/modules/enquiries";
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

const CHANNEL = { web: "Web", email: "Email", whatsapp: "WhatsApp", event_form: "Event form" };
const sentAt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

/**
 * Q6 "Replies": enquiry replies staff approved and sent, derived from `reply_drafts` (no new
 * table), within the signed-in role's own lanes. Nothing is emailed or messaged.
 */
async function Replies() {
  const staff = await requireDevStaff();
  let replies;
  try {
    replies = await inbox.sentReplies({ userId: staff.id, role: staff.role });
  } catch (error) {
    console.error("dev outbox replies failed", error);
    return <RetryError title="We could not load sent replies" message="Please try again." />;
  }
  if (!replies.length)
    return (
      <EmptyState
        icon={<MessageSquareReply strokeWidth={1.5} />}
        message="No replies sent yet. Approve and send a draft in the inbox to see it here."
      />
    );
  return (
    <ul className="flex flex-col gap-4">
      {replies.map((r) => (
        <li key={`${r.enquiryId}:${r.sentAt}`}>
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">
                To {r.senderName} · {r.senderContact}
              </p>
              <Badge>{CHANNEL[r.channel]}</Badge>
            </div>
            <p className="mt-1 text-small text-muted">
              {r.enquiryId} · sent {sentAt.format(new Date(r.sentAt))} by {r.approvedBy ?? "staff"}
              {r.edited ? " · edited by staff" : ""}
            </p>
            <p className="mt-3 rounded-control border border-border bg-surface-2 p-3 whitespace-pre-wrap">
              {r.body}
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

type Params = Promise<Record<string, string | string[] | undefined>>;

async function Tabs({ searchParams }: { searchParams: Params }) {
  const tab = (await searchParams).tab === "replies" ? "replies" : "bookings";
  const link = (key: string, label: string, href: string) => (
    <Link
      href={href}
      aria-current={tab === key ? "page" : undefined}
      className={cn(
        "flex h-11 items-center rounded-control px-3 text-small font-semibold",
        tab === key ? "bg-accent-soft text-accent" : "text-text hover:bg-surface-2",
      )}
    >
      {label}
    </Link>
  );
  return (
    <>
      <nav aria-label="Outbox views" className="mb-4 flex gap-1">
        {link("bookings", "Booking emails", "/dev/outbox")}
        {link("replies", "Replies", "/dev/outbox?tab=replies")}
      </nav>
      <p className="mb-6 text-body text-muted">
        {tab === "replies"
          ? "Enquiry replies staff approved and sent. Derived, never sent."
          : "Confirmation emails for the last 20 confirmed bookings. Derived, never sent."}
      </p>
      <Suspense key={tab} fallback={<Skeleton className="h-96 rounded-card" />}>
        {tab === "replies" ? <Replies /> : <Outbox />}
      </Suspense>
    </>
  );
}

export default function OutboxPage({ searchParams }: { searchParams: Params }) {
  return (
    <DevGate>
      <main className="mx-auto max-w-read px-4 py-10 md:px-8">
        <h1 className="mb-4 text-h1 font-medium">Outbox</h1>
        <Suspense fallback={<Skeleton className="h-96 rounded-card" />}>
          <Tabs searchParams={searchParams} />
        </Suspense>
      </main>
    </DevGate>
  );
}
