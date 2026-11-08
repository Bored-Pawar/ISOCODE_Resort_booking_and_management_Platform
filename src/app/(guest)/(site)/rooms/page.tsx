import type { Metadata } from "next";
import { Suspense } from "react";
import { StepIndicator } from "@/components/ui";
import { StayBuilder, StayBuilderSkeleton } from "../../_components/stay-builder";

export const metadata: Metadata = { title: "Build your stay" };

/** The stay builder: B6 step 1. `/book` redirects here with its params (next.config.ts). */
export default function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="mx-auto max-w-page px-4 pt-8 pb-28 md:px-8 lg:pb-16">
      <StepIndicator current={1} />
      <h1 className="mt-3 font-display text-h1 font-medium">Build your stay</h1>
      <div className="mt-6">
        <Suspense fallback={<StayBuilderSkeleton />}>
          <StayBuilder searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
