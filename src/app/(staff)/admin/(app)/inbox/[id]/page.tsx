import { Suspense } from "react";
import { Card, EmptyState, Skeleton } from "@/components/ui";
import { inbox, type InboxActor } from "@/modules/enquiries";
import { RetryError } from "@/app/(guest)/_components/retry-error";
import { Forbidden } from "../../_components/forbidden";
import { Detail } from "../_components/detail";
import { InboxFrame } from "../_components/frame";
import { inboxPage } from "../_lib/access";
import { parseQuery, type SearchParams } from "../_lib/params";

export const metadata = { title: "Enquiry" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> };

async function Loaded({ id, actor }: { id: string; actor: InboxActor }) {
  let res;
  try {
    res = await inbox.detail(id, actor);
  } catch (error) {
    console.error("inbox detail failed", error);
    return <RetryError title="We could not load this enquiry" message="Please try again." />;
  }
  if (!res.ok)
    return (
      <Card padded={false}>
        <EmptyState message="This enquiry is not in your lanes, or it no longer exists." />
      </Card>
    );
  return <Detail detail={res.detail} actor={actor} />;
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading enquiry" className="flex flex-col gap-4">
      <Skeleton className="h-48 w-full rounded-card" />
      <Skeleton className="h-64 w-full rounded-card" />
    </div>
  );
}

async function Content({ params, searchParams }: Props) {
  const access = await inboxPage();
  if ("forbidden" in access) return <Forbidden />;
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const decoded = decodeURIComponent(id).slice(0, 40);
  const query = parseQuery(sp, access.actor.role);
  return (
    <InboxFrame
      query={query}
      actor={access.actor}
      selectedId={decoded}
      detail={
        <Suspense key={decoded} fallback={<DetailSkeleton />}>
          <Loaded id={decoded} actor={access.actor} />
        </Suspense>
      }
    />
  );
}

export default function EnquiryPage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content {...props} />
    </Suspense>
  );
}
