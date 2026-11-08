import { Suspense } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Select, TableSkeleton } from "@/components/ui";
import { getGuestContacts } from "@/lib/auth/profile";
import { formatNightDate, nightsBetween } from "@/lib/dates";
import { formatInr } from "@/lib/money";
import { cn } from "@/lib/utils";
import { booking } from "@/modules/booking";
import { catalog } from "@/modules/catalog";
import { RetryError } from "@/app/(guest)/_components/retry-error";
import { roomsSummary } from "@/app/(guest)/_lib/account";
import { PageGate } from "../_components/page-gate";
import { requireBookingStaff } from "./_lib/access";
import { parseFilters, STATUS_TONE, STATUSES, type BookingFilters } from "./_lib/filters";

export const metadata = { title: "Bookings" };

type Params = Promise<Record<string, string | string[] | undefined>>;

const created = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

function Tabs({ filters }: { filters: BookingFilters }) {
  const tab = (key: BookingFilters["tab"], label: string, href: string) => (
    <Link
      href={href}
      aria-current={filters.tab === key ? "page" : undefined}
      className={cn(
        "flex h-11 items-center rounded-control px-3 text-small font-semibold",
        filters.tab === key ? "bg-accent-soft text-accent" : "text-text hover:bg-surface-2",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Bookings views" className="flex gap-1">
      {tab("bookings", "All bookings", "/admin/bookings")}
      {tab("refunds", "Refund pending", "/admin/bookings?tab=refunds")}
    </nav>
  );
}

async function BookingsTable({ filters }: { filters: BookingFilters }) {
  const { actor } = await requireBookingStaff();
  let result;
  let types;
  let contacts;
  try {
    result = await booking.listForStaff(
      {
        status: filters.status,
        checkInFrom: filters.checkInFrom,
        checkInTo: filters.checkInTo,
        limit: 100,
      },
      actor,
    );
    [types, contacts] = await Promise.all([
      catalog.listRoomTypes(),
      getGuestContacts(result.ok ? result.bookings.map((b) => b.guestId) : []),
    ]);
  } catch (error) {
    console.error("staff bookings failed", error);
    return <RetryError title="We could not load bookings" message="Please try again." />;
  }
  if (!result.ok)
    return <RetryError title="We could not load bookings" message="Please try again." />;
  const names = new Map(types.map((t) => [t.id, t.name]));
  if (!result.bookings.length)
    return (
      <Card padded={false}>
        <EmptyState
          icon={<Inbox strokeWidth={1.5} />}
          message="No bookings match these filters."
          action={
            <Link href="/admin/bookings" className="font-semibold text-accent hover:underline">
              Clear filters
            </Link>
          }
        />
      </Card>
    );
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full min-w-[880px] text-small">
        <thead className="bg-surface-2 text-left">
          <tr className="h-11">
            <th className="sticky left-0 bg-surface-2 px-3 font-semibold">Ref</th>
            <th className="px-3 font-semibold">Guest</th>
            <th className="px-3 font-semibold">Dates</th>
            <th className="px-3 font-semibold">Rooms</th>
            <th className="px-3 text-right font-semibold">Total</th>
            <th className="px-3 font-semibold">Status</th>
            <th className="px-3 font-semibold">Created</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {result.bookings.map((b) => {
            const guest = contacts.get(b.guestId);
            const n = nightsBetween(b.checkIn, b.checkOut);
            return (
              <tr key={b.id} className="h-11 border-t border-border">
                <td className="sticky left-0 bg-surface px-3">
                  <Link
                    href={`/admin/bookings/${encodeURIComponent(b.ref)}`}
                    className="font-semibold text-accent hover:underline"
                  >
                    {b.ref}
                  </Link>
                </td>
                <td className="max-w-56 px-3">
                  <span className="block truncate">{guest?.name ?? "Unknown"}</span>
                  <span className="block truncate text-muted">{guest?.email}</span>
                </td>
                <td className="px-3 whitespace-nowrap">
                  {formatNightDate(b.checkIn)} to {formatNightDate(b.checkOut)} · {n}n
                </td>
                <td className="max-w-56 truncate px-3">{roomsSummary(b.rooms, names)}</td>
                <td className="px-3 text-right">{formatInr(b.totalPaise)}</td>
                <td className="px-3">
                  <Badge tone={STATUS_TONE[b.status]}>{b.status.toLowerCase()}</Badge>
                </td>
                <td className="px-3 whitespace-nowrap text-muted">
                  {created.format(new Date(b.createdAt))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

async function RefundTable() {
  const { actor } = await requireBookingStaff();
  let result;
  try {
    result = await booking.listRefundPending({ limit: 100 }, actor);
  } catch (error) {
    console.error("refund list failed", error);
    return <RetryError title="We could not load refunds" message="Please try again." />;
  }
  if (!result.ok)
    return <RetryError title="We could not load refunds" message="Please try again." />;
  if (!result.payments.length)
    return (
      <Card padded={false}>
        <EmptyState
          icon={<Inbox strokeWidth={1.5} />}
          message="No payments waiting for a refund."
          action={
            <Link href="/admin/bookings" className="font-semibold text-accent hover:underline">
              See all bookings
            </Link>
          }
        />
      </Card>
    );
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full min-w-[720px] text-small">
        <thead className="bg-surface-2 text-left">
          <tr className="h-11">
            <th className="px-3 font-semibold">Booking</th>
            <th className="px-3 font-semibold">Provider payment</th>
            <th className="px-3 text-right font-semibold">Amount</th>
            <th className="px-3 font-semibold">Received</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {result.payments.map((p) => (
            <tr key={p.id} className="h-11 border-t border-border">
              <td className="px-3">
                <Link
                  href={`/admin/bookings/${encodeURIComponent(p.ref)}`}
                  className="font-semibold text-accent hover:underline"
                >
                  {p.ref}
                </Link>
              </td>
              <td className="max-w-80 truncate px-3 font-mono text-xs">
                {p.provider}: {p.providerPaymentId}
              </td>
              <td className="px-3 text-right">{formatInr(p.amountPaise)}</td>
              <td className="px-3 whitespace-nowrap text-muted">
                {created.format(new Date(p.createdAt))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: Params }) {
  const filters = parseFilters(await searchParams);
  await requireBookingStaff();
  return (
    <>
      <div className="mt-4">
        <Tabs filters={filters} />
      </div>
      {filters.tab === "bookings" ? (
        <>
          <form
            method="get"
            className="mt-4 grid gap-3 sm:grid-cols-[repeat(3,minmax(0,12rem))_auto] sm:items-end"
          >
            <Select label="Status" name="status" defaultValue={filters.status ?? ""}>
              <option value="">Any status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
            <Input
              label="Check-in from"
              name="from"
              type="date"
              defaultValue={filters.checkInFrom}
            />
            <Input label="Check-in to" name="to" type="date" defaultValue={filters.checkInTo} />
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </form>
          <div className="mt-4">
            <Suspense fallback={<TableSkeleton cols={7} />}>
              <BookingsTable filters={filters} />
            </Suspense>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <Suspense fallback={<TableSkeleton cols={4} />}>
            <RefundTable />
          </Suspense>
        </div>
      )}
    </>
  );
}

/** A5: staff bookings, read only. Reservations and gm (sales has no booking authority). */
export default function StaffBookingsPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<TableSkeleton cols={7} />}>
      <PageGate cap="bookings.view">
        <h1 className="text-h1">Bookings</h1>
        <p className="mt-1 text-small text-muted">Read only. Newest first, up to 100 rows.</p>
        <Suspense fallback={<TableSkeleton cols={7} />}>
          <Content searchParams={searchParams} />
        </Suspense>
      </PageGate>
    </Suspense>
  );
}
