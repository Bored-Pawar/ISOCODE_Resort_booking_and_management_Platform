import type { Metadata } from "next";
import { Suspense } from "react";
import { StepIndicator } from "@/components/ui";
import { BookCart, BookCartSkeleton } from "../../_components/book-cart";

export const metadata: Metadata = { title: "Your rooms" };

/** B6 step 1: the room cart. Steps 2 (details) and 3 (pay) follow. */
export default function BookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="mx-auto max-w-page px-4 pt-8 pb-28 md:px-8 lg:pb-16">
      <StepIndicator current={1} />
      <h1 className="mt-3 font-display text-h1 font-medium">Your rooms</h1>
      <div className="mt-6">
        <Suspense fallback={<BookCartSkeleton />}>
          <BookCart searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
