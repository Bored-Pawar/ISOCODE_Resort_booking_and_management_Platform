import type { Metadata } from "next";
import { Suspense } from "react";
import { RoomsResults, RoomsSkeleton } from "../../_components/rooms-results";

export const metadata: Metadata = { title: "Rooms" };

export default function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="mx-auto max-w-page px-4 py-8 md:px-8 md:py-12">
      <h1 className="font-display text-h1 font-medium">Rooms for your stay</h1>
      <div className="mt-6">
        <Suspense fallback={<RoomsSkeleton />}>
          <RoomsResults searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
