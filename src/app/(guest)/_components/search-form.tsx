"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, DateRange, FieldNote, Stepper, type DateRangeValue } from "@/components/ui";
import { addDays, isDateStr } from "@/lib/dates";
import {
  SEARCH_LIMITS,
  toSearchParams,
  validateSearch,
  type SearchIssue,
  type SearchValues,
} from "../_lib/search";

/**
 * Date and guest search. Receives `today` and any prefilled values as props (it never reads the
 * clock or the URL itself), validates on submit and navigates with URL params.
 */
export function SearchForm({
  today,
  defaults,
  action = "/rooms",
  submitLabel = "Check availability",
}: {
  today: string;
  defaults: SearchValues;
  action?: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dates, setDates] = useState<DateRangeValue>({
    checkIn: defaults.checkIn,
    checkOut: defaults.checkOut,
  });
  const [adults, setAdults] = useState(defaults.adults);
  const [children, setChildren] = useState(defaults.children);
  const [issue, setIssue] = useState<SearchIssue | null>(null);

  function onDates(next: DateRangeValue) {
    // Picking a check-in suggests a one night stay so the guest only changes what they need to.
    if (isDateStr(next.checkIn) && (!isDateStr(next.checkOut) || next.checkOut <= next.checkIn)) {
      if (next.checkIn !== dates.checkIn) next = { ...next, checkOut: addDays(next.checkIn, 1) };
    }
    setDates(next);
    setIssue(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values: SearchValues = { ...dates, adults, children };
    const found = validateSearch(values, today);
    setIssue(found);
    if (found) return;
    startTransition(() => router.push(`${action}?${toSearchParams(values)}`));
  }

  // The date inputs already explain a past or reversed range inline; show everything else below.
  const formIssue = issue && issue.code !== "past" && issue.code !== "order" ? issue : null;

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Search availability">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_auto] lg:items-start">
        <DateRange value={dates} onChange={onDates} min={today} />
        <div className="flex flex-col gap-2 lg:pt-6">
          <Stepper
            label="Adults"
            hint="Age 13 and over"
            value={adults}
            min={1}
            max={SEARCH_LIMITS.maxAdults}
            onChange={(n) => {
              setAdults(n);
              setIssue(null);
            }}
          />
          <Stepper
            label="Children"
            hint="Age 12 and under"
            value={children}
            max={SEARCH_LIMITS.maxChildren}
            onChange={(n) => {
              setChildren(n);
              setIssue(null);
            }}
          />
        </div>
        <Button type="submit" loading={pending} className="w-full lg:mt-6 lg:w-auto">
          {submitLabel}
        </Button>
      </div>
      {formIssue ? (
        <div className="mt-4">
          <FieldNote error={formIssue.message} />
        </div>
      ) : null}
    </form>
  );
}
