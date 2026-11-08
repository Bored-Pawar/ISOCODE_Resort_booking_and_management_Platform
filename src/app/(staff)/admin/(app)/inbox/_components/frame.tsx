import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Inbox as InboxIcon } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Select, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { inbox, type InboxActor } from "@/modules/enquiries";
import {
  CHANNELS,
  formatWaiting,
  LANE_EMPTY,
  LANE_LABELS,
  lanesFor,
  STATUSES,
} from "@/modules/enquiries/staff/rules";
import { RetryError } from "@/app/(guest)/_components/retry-error";
import { queryString, type InboxQuery } from "../_lib/params";
import {
  AiBadge,
  CategoryBadge,
  ChannelBadge,
  CHANNEL_LABEL,
  ComplaintBadge,
  ConfidenceBadge,
  EvidenceBadge,
  STATUS_LABEL,
  WaitingBadge,
} from "./badges";
import { LaneSelect } from "./lane-select";

async function Lanes({ query, actor }: { query: InboxQuery; actor: InboxActor }) {
  const lanes = lanesFor(actor.role);
  let counts: Awaited<ReturnType<typeof inbox.counts>> = {};
  try {
    counts = await inbox.counts(actor);
  } catch (error) {
    console.error("inbox counts failed", error);
  }
  const href = (lane: string) => `/admin/inbox${queryString({ ...query, lane: lane as never })}`;
  return (
    <>
      <div className="lg:hidden">
        <LaneSelect
          value={query.lane}
          options={lanes.map((l) => ({
            value: l,
            label: counts[l] ? `${LANE_LABELS[l]} (${counts[l]})` : LANE_LABELS[l],
            href: href(l),
          }))}
        />
      </div>
      <nav aria-label="Inbox lanes" className="hidden flex-col gap-1 lg:flex">
        {lanes.map((l) => (
          <Link
            key={l}
            href={href(l)}
            aria-current={query.lane === l ? "page" : undefined}
            className={cn(
              "flex h-11 items-center justify-between rounded-control px-3 text-small font-semibold",
              query.lane === l ? "bg-accent-soft text-accent" : "text-text hover:bg-surface-2",
            )}
          >
            {LANE_LABELS[l]}
            {counts[l] ? (
              <Badge
                tone={l === "complaints" ? "danger" : "warning"}
                className="tabular-nums"
                aria-label={`${counts[l]} open`}
              >
                {counts[l]}
              </Badge>
            ) : null}
          </Link>
        ))}
      </nav>
    </>
  );
}

function Filters({ query }: { query: InboxQuery }) {
  return (
    <form method="get" action="/admin/inbox" className="grid grid-cols-2 gap-2">
      <input type="hidden" name="lane" value={query.lane} />
      <Select label="Status" name="status" defaultValue={query.status ?? ""}>
        <option value="">Any</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </Select>
      <Select label="Channel" name="channel" defaultValue={query.channel ?? ""}>
        <option value="">Any</option>
        {CHANNELS.map((c) => (
          <option key={c} value={c}>
            {CHANNEL_LABEL[c]}
          </option>
        ))}
      </Select>
      <Input
        label="Search summaries"
        name="q"
        type="search"
        maxLength={100}
        defaultValue={query.q ?? ""}
        className="col-span-2"
      />
      <Button type="submit" variant="secondary" size="sm" className="col-span-2">
        Apply filters
      </Button>
    </form>
  );
}

export function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading enquiries" className="flex flex-col gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="rounded-card border border-border bg-surface p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-3 h-5 w-2/3" />
        </div>
      ))}
    </div>
  );
}

async function List({
  query,
  actor,
  selectedId,
}: {
  query: InboxQuery;
  actor: InboxActor;
  selectedId?: string;
}) {
  let res;
  try {
    res = await inbox.list(query, actor);
  } catch (error) {
    console.error("inbox list failed", error);
    return <RetryError title="We could not load the inbox" message="Please try again." />;
  }
  if (!res.ok)
    return (
      <RetryError
        title="We could not load this lane"
        message={
          res.code === "FORBIDDEN"
            ? "Your role cannot open this lane."
            : "Check the filters and try again."
        }
      />
    );
  if (!res.rows.length)
    return (
      <Card padded={false}>
        <EmptyState
          icon={<InboxIcon strokeWidth={1.5} />}
          message={
            query.status || query.channel || query.q
              ? "No enquiries match these filters."
              : LANE_EMPTY[query.lane]
          }
          action={
            query.status || query.channel || query.q ? (
              <Link
                href={`/admin/inbox${queryString({ lane: query.lane })}`}
                className="font-semibold text-accent hover:underline"
              >
                Clear filters
              </Link>
            ) : undefined
          }
        />
      </Card>
    );
  const now = new Date().toISOString();
  const qs = queryString(query, true);
  return (
    <>
      <ul className="flex flex-col gap-2">
        {res.rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/admin/inbox/${encodeURIComponent(r.id)}${qs}`}
              aria-current={selectedId === r.id ? "true" : undefined}
              className={cn(
                "block rounded-card border bg-surface p-4 transition-colors duration-150 ease-out hover:bg-surface-2",
                selectedId === r.id ? "border-accent" : "border-border",
              )}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold">{r.senderName}</span>
                <span className="shrink-0 text-xs text-muted">{r.id}</span>
              </span>
              <span className="mt-1 block truncate text-small text-muted">{r.summary}</span>
              <span className="mt-2 flex flex-wrap gap-1">
                <CategoryBadge category={r.category} />
                <ChannelBadge channel={r.channel} />
                <ConfidenceBadge confidence={r.confidence} />
                {r.isComplaint ? <ComplaintBadge /> : null}
                <AiBadge status={r.aiStatus} />
                {r.grounding ? (
                  <EvidenceBadge label="Dates" value={r.grounding.dates as never} />
                ) : null}
                <WaitingBadge
                  text={formatWaiting(r.receivedAt, r.firstReplyAt ?? now)}
                  replied={!!r.firstReplyAt}
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-between text-small">
        {query.cursor ? (
          <Link href={`/admin/inbox${queryString(query)}`} className="font-semibold text-accent">
            Newest
          </Link>
        ) : (
          <span />
        )}
        {res.nextCursor ? (
          <Link
            href={`/admin/inbox${queryString({ ...query, cursor: res.nextCursor }, true)}`}
            className="font-semibold text-accent"
          >
            Older
          </Link>
        ) : null}
      </div>
    </>
  );
}

/**
 * Screen 7: lanes and filters left, list middle, detail right on desktop (lg). Below lg the lanes
 * become a select, and the detail is its own page (`/admin/inbox/[id]`) with a back link.
 */
export function InboxFrame({
  query,
  actor,
  selectedId,
  detail,
}: {
  query: InboxQuery;
  actor: InboxActor;
  selectedId?: string;
  detail?: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[200px_minmax(300px,360px)_minmax(0,1fr)] lg:gap-6">
      <aside className={cn("flex flex-col gap-4", detail && "hidden lg:flex")}>
        <h1 className="text-h1">Inbox</h1>
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <Lanes query={query} actor={actor} />
        </Suspense>
      </aside>
      <section
        aria-label="Enquiries"
        className={cn("flex flex-col gap-4", detail && "hidden lg:flex")}
      >
        <Filters query={query} />
        <Suspense key={JSON.stringify(query)} fallback={<ListSkeleton />}>
          <List query={query} actor={actor} selectedId={selectedId} />
        </Suspense>
      </section>
      <section aria-label="Enquiry detail" className={cn(!detail && "hidden lg:block")}>
        {detail ? (
          <>
            <Link
              href={`/admin/inbox${queryString(query, true)}`}
              className="mb-3 inline-flex items-center gap-1 text-small font-semibold text-accent lg:hidden"
            >
              <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden />
              Back to {LANE_LABELS[query.lane]}
            </Link>
            {detail}
          </>
        ) : (
          <Card padded={false}>
            <EmptyState message="Select an enquiry to read it, fix routing and reply." />
          </Card>
        )}
      </section>
    </div>
  );
}
