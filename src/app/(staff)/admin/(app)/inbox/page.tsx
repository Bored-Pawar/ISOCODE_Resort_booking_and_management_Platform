import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { Forbidden } from "../_components/forbidden";
import { InboxFrame } from "./_components/frame";
import { inboxPage } from "./_lib/access";
import { parseQuery, type SearchParams } from "./_lib/params";

export const metadata = { title: "Inbox" };

async function Content({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await inboxPage();
  if ("forbidden" in access) return <Forbidden />;
  const query = parseQuery(await searchParams, access.actor.role);
  return <InboxFrame query={query} actor={access.actor} />;
}

export default function InboxPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
