import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { todayIST } from "@/lib/dates";
import { booking } from "@/modules/booking";
import { staffOverview } from "./_lib/access";
import { INBOX_PENDING, overviewFor, type OverviewItem } from "./_lib/overview";

export const metadata = { title: "Overview" };

async function ArrivalsCount({
  actor,
}: {
  actor: { userId: string; role: "reservations" | "gm" };
}) {
  const today = todayIST();
  let count: number | null = null;
  try {
    const res = await booking.listForStaff(
      { status: "CONFIRMED", checkInFrom: today, checkInTo: today, limit: 200 },
      actor,
    );
    if (res.ok) count = res.bookings.length;
  } catch (error) {
    console.error("arrivals count failed", error);
  }
  if (count === null)
    return <span className="text-small text-danger">Could not load. Reload to retry.</span>;
  return <span className="text-h2 tabular-nums">{count === 200 ? "200+" : count}</span>;
}

function Row({
  item,
  actor,
}: {
  item: OverviewItem;
  actor: { userId: string; role: "reservations" | "sales" | "gm" };
}) {
  const base = "flex min-h-14 items-center justify-between gap-4 border-b border-border px-4 py-3";
  if (item.kind === "pending")
    return (
      <li className={base}>
        <span className="text-small font-semibold">{item.label}</span>
        <span className="text-small text-muted">{INBOX_PENDING}</span>
      </li>
    );
  if (item.kind === "arrivals")
    return (
      <li>
        <Link href={item.href} className={`${base} hover:bg-surface-2`}>
          <span className="text-small font-semibold">{item.label}</span>
          <span className="flex items-center gap-2">
            {actor.role === "sales" ? null : (
              <Suspense fallback={<Skeleton className="h-7 w-8" />}>
                <ArrivalsCount actor={{ userId: actor.userId, role: actor.role }} />
              </Suspense>
            )}
            <ChevronRight className="size-[18px] text-muted" aria-hidden />
          </span>
        </Link>
      </li>
    );
  return (
    <li>
      <Link href={item.href} className={`${base} hover:bg-surface-2`}>
        <span className="flex flex-col">
          <span className="text-small font-semibold text-accent">{item.label}</span>
          <span className="text-small text-muted">{item.help}</span>
        </span>
        <ChevronRight className="size-[18px] text-muted" aria-hidden />
      </Link>
    </li>
  );
}

async function Overview() {
  const { user } = await staffOverview();
  const { intro, items } = overviewFor(user.role, todayIST());
  const actor = { userId: user.id, role: user.role };
  const firstLink = items.findIndex((i) => i.kind === "link");
  const status = firstLink === -1 ? items : items.slice(0, firstLink);
  const links = firstLink === -1 ? [] : items.slice(firstLink);
  return (
    <>
      <p className="mt-1 max-w-[640px] text-small text-muted">{intro}</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="today">
          <h2 id="today" className="text-h2">
            Today
          </h2>
          <ul className="mt-3 overflow-hidden rounded-card border border-border bg-surface [&>li:last-child]:border-b-0 [&>li:last-child>*]:border-b-0">
            {status.map((item) => (
              <Row key={item.label} item={item} actor={actor} />
            ))}
          </ul>
        </section>
        {links.length ? (
          <section aria-labelledby="manage">
            <h2 id="manage" className="text-h2">
              Manage
            </h2>
            <ul className="mt-3 overflow-hidden rounded-card border border-border bg-surface [&>li:last-child>*]:border-b-0">
              {links.map((item) => (
                <Row key={item.label} item={item} actor={actor} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}

export default function AdminHome() {
  return (
    <>
      <h1 className="text-h1">Overview</h1>
      <Suspense fallback={<Skeleton className="mt-6 h-64 rounded-card" />}>
        <Overview />
      </Suspense>
    </>
  );
}
