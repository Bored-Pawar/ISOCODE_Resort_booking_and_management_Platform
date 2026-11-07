import { connection } from "next/server";
import { Skeleton } from "@/components/ui";
import { todayIST } from "@/lib/dates";
import { parseSearchParams } from "../_lib/search";
import { SearchForm } from "./search-form";

/**
 * Server side wrapper: reads the URL params and the clock, so it must render inside <Suspense>
 * (cacheComponents). Passes plain props to the client form.
 */
export async function SearchSection({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const defaults = parseSearchParams(await searchParams);
  // Opt into request time before reading the clock (cacheComponents forbids it while prerendering).
  await connection();
  return <SearchForm today={todayIST()} defaults={defaults} />;
}

/** Matches the final search card so nothing shifts when the form arrives. */
export function SearchSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading search"
      className="grid gap-6 lg:grid-cols-[5fr_4fr_auto]"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-[68px]" />
        <Skeleton className="h-[68px]" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </div>
      <Skeleton className="h-11 lg:w-48" />
    </div>
  );
}
