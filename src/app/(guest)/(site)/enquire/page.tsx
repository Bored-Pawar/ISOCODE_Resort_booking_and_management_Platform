import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui";
import { todayIST } from "@/lib/dates";
import { catalog } from "@/modules/catalog";
import { EnquiryForm } from "../../_components/enquiry-form";
import { parseEnquiryParams } from "../../_lib/enquiry";

export const metadata: Metadata = { title: "Send an enquiry" };

async function Content({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const defaults = parseEnquiryParams(await searchParams);
  // Opt into request time before reading the clock (cacheComponents forbids it while prerendering).
  await connection();
  let roomName: string | undefined;
  if (defaults.room) {
    try {
      roomName = (await catalog.getRoomTypeBySlug(defaults.room))?.name;
    } catch {
      roomName = undefined; // context only: the form still works without it
    }
  }
  return <EnquiryForm today={todayIST()} defaults={defaults} roomName={roomName} />;
}

function FormSkeleton() {
  return (
    <div role="status" aria-label="Loading form" className="flex flex-col gap-4">
      <Skeleton className="h-[68px]" />
      <Skeleton className="h-36" />
      <Skeleton className="h-11 w-40" />
    </div>
  );
}

export default function EnquirePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="mx-auto max-w-page px-4 py-8 md:px-8 md:py-12">
      <h1 className="font-display text-h1 font-medium">Send us an enquiry</h1>
      <p className="mt-2 max-w-read text-body text-muted">
        Weddings, offsites, large groups or longer stays. Tell us what you have in mind and we reply
        within a day.
      </p>
      <div className="mt-8 max-w-2xl rounded-card border border-border bg-surface p-5 md:p-6">
        <Suspense fallback={<FormSkeleton />}>
          <Content searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
