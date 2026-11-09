import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { GridColumn } from "@/components/ui/data-grid";
import { addDays, eachNight } from "@/lib/dates";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DAY_NAMES, dayOfWeek, GRID_DAYS, isWeekend } from "@/modules/admin/rules";

const monthFmt = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" });
const longFmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * 30 date columns. The month name appears only on the first column and where a month starts,
 * so a span reads like a calendar strip. Weekend nights (Fri, Sat) are shaded.
 */
export function dateColumns(start: string, editable = true): GridColumn[] {
  return eachNight(start, addDays(start, GRID_DAYS)).map((date, i) => {
    const d = new Date(`${date}T00:00:00Z`);
    const day = d.getUTCDate();
    const showMonth = i === 0 || day === 1;
    return {
      key: date,
      label: longFmt.format(d).replace(",", ""),
      shaded: isWeekend(date),
      editable,
      header: (
        <span className="flex flex-col items-end leading-tight">
          <span className={cn("text-xs", showMonth ? "font-semibold text-text" : "text-muted")}>
            {showMonth ? monthFmt.format(d) : DAY_NAMES[dayOfWeek(date)]}
          </span>
          <span>
            {showMonth ? `${DAY_NAMES[dayOfWeek(date)]} ` : ""}
            {day}
          </span>
        </span>
      ),
    };
  });
}

/**
 * Previous / next 30 days, kept inside the editable window. Under `sm` the range label takes its
 * own row above two half-width buttons, so the toolbar never widens the page at 320 px (QA-03).
 * DOM order stays Previous, label, Next for keyboard users.
 */
export function DateStepper({
  start,
  window,
  hrefFor,
}: {
  start: string;
  window: { first: string; last: string };
  hrefFor: (start: string) => string;
}) {
  const prev = start > window.first ? addDays(start, -GRID_DAYS) : null;
  const latest = addDays(window.last, -(GRID_DAYS - 1));
  const next = start < latest ? addDays(start, GRID_DAYS) : null;
  const end = addDays(start, GRID_DAYS - 1);
  const label = (d: string) => longFmt.format(new Date(`${d}T00:00:00Z`)).replace(",", "");
  const step = cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full sm:w-auto");
  return (
    <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto">
      {prev ? (
        <Link
          href={hrefFor(prev < window.first ? window.first : prev)}
          className={step}
          aria-label="Previous 30 days"
        >
          <ChevronLeft className="size-4" aria-hidden /> Previous
        </Link>
      ) : (
        <span className={cn(step, "pointer-events-none opacity-50")} aria-disabled>
          <ChevronLeft className="size-4" aria-hidden /> Previous
        </span>
      )}
      <span className="order-first col-span-2 text-small text-muted tabular-nums sm:order-none sm:whitespace-nowrap">
        {label(start)} to {label(end)}
      </span>
      {next ? (
        <Link
          href={hrefFor(next > latest ? latest : next)}
          className={step}
          aria-label="Next 30 days"
        >
          Next <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span className={cn(step, "pointer-events-none opacity-50")} aria-disabled>
          Next <ChevronRight className="size-4" aria-hidden />
        </span>
      )}
    </div>
  );
}

/** Day of week checkboxes with All, Weekdays (Sun to Thu) and Weekends (Fri, Sat) presets. */
export function DayPicker({
  days,
  onChange,
  error,
}: {
  days: number[];
  onChange: (days: number[]) => void;
  error?: string;
}) {
  const preset = (label: string, value: number[]) => {
    const on = value.length === days.length && value.every((d) => days.includes(d));
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => onChange(value)}
        className={cn(
          "h-9 rounded-control border px-3 text-small font-semibold",
          on ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-2",
        )}
      >
        {label}
      </button>
    );
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-small font-semibold">Days of the week</legend>
      <div className="flex flex-wrap gap-2">
        {preset("All", [0, 1, 2, 3, 4, 5, 6])}
        {preset("Weekdays", [0, 1, 2, 3, 4])}
        {preset("Weekends", [5, 6])}
      </div>
      <div className="flex flex-wrap gap-1">
        {DAY_NAMES.map((name, d) => (
          <label
            key={name}
            className={cn(
              "flex h-9 min-w-11 cursor-pointer items-center justify-center rounded-control border px-2 text-small has-focus-visible:outline-2 has-focus-visible:outline-accent",
              days.includes(d) ? "border-accent bg-accent-soft text-accent" : "border-border",
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={days.includes(d)}
              onChange={(e) =>
                onChange(e.target.checked ? [...days, d].sort() : days.filter((x) => x !== d))
              }
            />
            {name}
          </label>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : (
        <p className="text-small text-muted">Weekends are Friday and Saturday nights.</p>
      )}
    </fieldset>
  );
}

/** A labelled group of checkboxes (room types, plans). */
export function CheckGroup({
  legend,
  options,
  value,
  onChange,
  error,
}: {
  legend: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-small font-semibold">{legend}</legend>
      <div className="flex flex-col gap-1">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-9 cursor-pointer items-center gap-2 text-small"
          >
            <input
              type="checkbox"
              className="size-4 accent-[var(--accent)]"
              checked={value.includes(o.value)}
              onChange={(e) =>
                onChange(
                  e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value),
                )
              }
            />
            {o.label}
          </label>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
