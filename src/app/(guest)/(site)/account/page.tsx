import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { CalendarSearch, Check, Clock, CircleSlash } from "lucide-react";
import { Badge, Button, ButtonLink, Card, EmptyState, Skeleton } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { signOutAction } from "@/lib/auth/actions";
import { formatStay, todayIST } from "@/lib/dates";
import { formatInr } from "@/lib/money";
import { booking, type Booking } from "@/modules/booking";
import { catalog } from "@/modules/catalog";
import { plural } from "../../_lib/format";
import { roomsSummary, statusView, type StatusView } from "../../_lib/account";
import { RetryError } from "../../_components/retry-error";
import { HeldActions } from "../../_components/held-actions";
import { PAY_COPY } from "../../_lib/pay-flow";
import Link from "next/link";

export const metadata = { title: "My bookings" };

const ICONS: Record<StatusView["tone"], React.ReactNode> = {
  success: <Check strokeWidth={1.5} />,
  warning: <Clock strokeWidth={1.5} />,
  neutral: <Clock strokeWidth={1.5} />,
  danger: <CircleSlash strokeWidth={1.5} />,
};
const GROUPS: { key: StatusView["group"]; title: string }[] = [
  { key: "upcoming", title: "Upcoming" },
  { key: "past", title: "Past stays" },
  { key: "closed", title: "Not completed" },
];

/** Request-time clock (the page already opted into request time with connection()). */
function withStatus(list: Booking[]) {
  const now = Date.now();
  const today = todayIST();
  return list.map((b) => ({ b, status: statusView(b, now, today) }));
}

async function Content() {
  // Auth.js uses crypto.getRandomValues() inside auth(); render at request time first.
  await connection();
  const user = await getSessionUser();
  if (!user || user.role !== "guest") redirect("/login?next=/account");

  let list: Booking[];
  let names: Map<string, string>;
  let refunds = new Set<string>();
  try {
    // The guest id comes from the session only.
    const [result, types, pending] = await Promise.all([
      booking.listForGuest({ guestId: user.id }),
      catalog.listRoomTypes(),
      booking.refundPendingForGuest({ guestId: user.id }),
    ]);
    if (pending.ok) refunds = new Set(pending.bookingIds);
    if (!result.ok) throw new Error(`listForGuest: ${result.code}`);
    list = result.bookings;
    names = new Map(types.map((t) => [t.id, t.name]));
  } catch (error) {
    console.error("my bookings failed", error);
    return (
      <>
        <Header name={user.name} email={user.email} />
        <RetryError
          title="We could not load your bookings"
          message="Something went wrong on our side. Please try again."
        />
      </>
    );
  }

  const rows = withStatus(list);

  return (
    <>
      <Header name={user.name} email={user.email} />
      {rows.length === 0 ? (
        <Card className="mt-8" padded={false}>
          <EmptyState
            icon={<CalendarSearch strokeWidth={1.5} />}
            message="You have no bookings yet."
            action={<ButtonLink href="/rooms">Build your stay</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          {GROUPS.map(({ key, title }) => {
            const inGroup = rows.filter((r) => r.status.group === key);
            // The list arrives newest stay first; upcoming reads better soonest first.
            const group = key === "upcoming" ? [...inGroup].reverse() : inGroup;
            if (!group.length) return null;
            return (
              <section key={key} aria-labelledby={`bookings-${key}`}>
                <h2 id={`bookings-${key}`} className="font-display text-h2 font-medium">
                  {title}
                </h2>
                <ul className="mt-3 flex flex-col gap-3">
                  {group.map(({ b, status }) => (
                    <li key={b.id}>
                      <Card className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-3">
                            <Link
                              href={`/booking/${encodeURIComponent(b.ref)}`}
                              className="font-display text-h2 font-medium text-accent tabular-nums hover:underline"
                            >
                              {b.ref}
                            </Link>
                            <Badge tone={status.tone} icon={ICONS[status.tone]}>
                              {status.label}
                            </Badge>
                          </p>
                          <p className="mt-1 text-body">{formatStay(b.checkIn, b.checkOut)}</p>
                          <p className="text-small text-muted">
                            {plural(b.rooms.length, "room")}: {roomsSummary(b.rooms, names)}
                          </p>
                          {refunds.has(b.id) ? (
                            <p className="mt-2 text-small text-warning" role="status">
                              {PAY_COPY.refundPending}
                            </p>
                          ) : null}
                          {status.resumable ? (
                            <div className="mt-3">
                              <HeldActions bookingId={b.id} bookingRef={b.ref} />
                            </div>
                          ) : null}
                        </div>
                        <p className="sm:text-right">
                          <span className="block font-semibold tabular-nums">
                            {formatInr(b.totalPaise)}
                          </span>
                          <span className="text-small text-muted tabular-nums">
                            incl. {formatInr(b.gstPaise)} GST
                          </span>
                        </p>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <form action={signOutAction} className="mt-10">
        <Button variant="secondary" type="submit">
          Sign out
        </Button>
      </form>
    </>
  );
}

function Header({ name, email }: { name: string; email: string }) {
  return (
    <header className="mb-2">
      <h1 className="font-display text-h1 font-medium">My bookings</h1>
      <p className="mt-1 text-muted">
        {name ? `${name}, signed in as ${email}` : `Signed in as ${email}`}
      </p>
    </header>
  );
}

function AccountSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading your bookings">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-80" />
      <Skeleton className="mt-6 h-28 rounded-card" />
      <Skeleton className="h-28 rounded-card" />
    </div>
  );
}

export default function AccountPage() {
  return (
    <main className="mx-auto max-w-page px-4 py-10 md:px-8">
      <Suspense fallback={<AccountSkeleton />}>
        <Content />
      </Suspense>
    </main>
  );
}
