import { ChevronDown } from "lucide-react";
import { formatStay } from "@/lib/dates";
import { guestsLabel } from "../_lib/format";
import type { SearchValues } from "../_lib/search";
import { SearchForm } from "./search-form";

/** Dates and guests for the current search, with the search form folded underneath ("Change"). */
export function SearchSummary({
  values,
  today,
  action,
}: {
  values: SearchValues;
  today: string;
  /** Where "Update" goes; defaults to the rooms list. */
  action?: string;
}) {
  return (
    <details className="group rounded-card border border-border bg-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 md:px-5 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block font-semibold">{formatStay(values.checkIn, values.checkOut)}</span>
          <span className="block text-small text-muted">
            {guestsLabel(values.adults, values.children)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-small font-semibold text-accent">
          Change
          <ChevronDown
            className="size-[18px] transition-transform duration-150 ease-out group-open:rotate-180"
            strokeWidth={1.5}
            aria-hidden
          />
        </span>
      </summary>
      <div className="border-t border-border p-4 md:p-5">
        <SearchForm today={today} defaults={values} action={action} submitLabel="Update" />
      </div>
    </details>
  );
}
