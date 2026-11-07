import { Suspense } from "react";
import { RoomDetail, RoomDetailSkeleton } from "../../../_components/room-detail";

export default function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="mx-auto max-w-page px-4 pt-4 pb-28 md:px-8 lg:pb-16">
      <Suspense fallback={<RoomDetailSkeleton />}>
        <RoomDetail params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
