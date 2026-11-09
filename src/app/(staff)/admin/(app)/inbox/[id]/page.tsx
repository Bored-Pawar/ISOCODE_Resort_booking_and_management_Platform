import { Suspense } from "react";
import { Card, EmptyState, Skeleton } from "@/components/ui";
import { inbox, type InboxActor } from "@/modules/enquiries";
import { RetryError } from "@/app/(guest)/_components/retry-error";
import { Forbidden } from "../../_components/forbidden";
import { isAttentionRequest } from "@/modules/enquiries/staff/rules";
import { AttentionPanel } from "../_components/attention-panel";
import { CHANNEL_LABEL } from "../_components/badges";
import { Detail } from "../_components/detail";
import { CloseButton, DraftPanel } from "../_components/draft-panel";
import { InboxFrame } from "../_components/frame";
import { inboxPage } from "../_lib/access";
import { parseQuery, type SearchParams } from "../_lib/params";
import { notFound } from "next/navigation";
import { z } from "zod";
import { safeError } from "@/lib/log";

const enquiryIdSchema = z.string().regex(/^ENQ-[\w-]{1,40}$/);

export const metadata = { title: "Enquiry" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> };

async function Loaded({ id, actor }: { id: string; actor: InboxActor }) {
  let res;
  try {
    res = await inbox.detail(id, actor);
  } catch (error) {
    console.error("inbox detail failed", safeError(error));
    return <RetryError title="We could not load this enquiry" message="Please try again." />;
  }
  if (!res.ok)
    return (
      <Card padded={false}>
        <EmptyState message="This enquiry is not in your lanes, or it no longer exists." />
      </Card>
    );
  const d = res.detail;
  const q = d.enquiry;
  const latest = d.timeline.find(isAttentionRequest);
  return (
    <Detail
      detail={d}
      actor={actor}
      attentionPanel={
        <AttentionPanel
          key={`${d.attentionOpen}:${latest?.id ?? ""}`}
          enquiryId={q.id}
          open={d.attentionOpen}
          request={
            d.attentionOpen && latest ? { note: latest.fromValue ?? "", by: latest.actor } : null
          }
          canRequest={d.can.requestAttention}
          canResolve={d.can.resolveAttention}
        />
      }
      draftPanel={
        <DraftPanel
          key={d.draft ? `${d.draft.id}:${d.draft.version}:${d.draft.sentAt}` : "none"}
          enquiryId={q.id}
          draft={d.draft}
          canWork={d.can.work}
          channelLabel={CHANNEL_LABEL[q.channel]}
          recipient={`${q.senderName} (${q.senderContact})`}
          approverName={d.staff.find((u) => u.id === d.draft?.approvedBy)?.name ?? null}
        />
      }
      closePanel={
        d.can.work && q.status !== "closed" ? (
          <div className="flex justify-end">
            <CloseButton enquiryId={q.id} />
          </div>
        ) : null
      }
    />
  );
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
  // Zod on the route param (CLAUDE.md rule 5); a malformed % sequence is a 404, not a crash.
  let raw = "";
  try {
    raw = decodeURIComponent(id);
  } catch {
    notFound();
  }
  const parsedId = enquiryIdSchema.safeParse(raw);
  if (!parsedId.success) notFound();
  const decoded = parsedId.data;
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
