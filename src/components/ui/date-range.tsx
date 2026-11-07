"use client";

import { Input } from "./input";
import { formatStay, isDateStr, nightsBetween } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type DateRangeValue = { checkIn: string; checkOut: string };

/** Check-in / check-out pair with validation. Dates are IST calendar dates (YYYY-MM-DD). */
export function DateRange({
  value,
  onChange,
  min,
  className,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  /** Earliest selectable check-in (usually today in IST). */
  min?: string;
  className?: string;
}) {
  const { checkIn, checkOut } = value;
  const both = isDateStr(checkIn) && isDateStr(checkOut);
  const inError = checkIn && min && checkIn < min ? "Check-in cannot be in the past" : undefined;
  const outError = both && checkOut <= checkIn ? "Check-out must be after check-in" : undefined;
  const nights = both && !outError ? nightsBetween(checkIn, checkOut) : 0;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          type="date"
          label="Check-in"
          min={min}
          value={checkIn}
          error={inError}
          onChange={(e) => onChange({ ...value, checkIn: e.target.value })}
        />
        <Input
          type="date"
          label="Check-out"
          min={checkIn || min}
          value={checkOut}
          error={outError}
          onChange={(e) => onChange({ ...value, checkOut: e.target.value })}
        />
      </div>
      {nights > 0 ? <p className="text-small text-muted">{formatStay(checkIn, checkOut)}</p> : null}
    </div>
  );
}
