"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Guest count stepper: label, minus, value, plus. 44px tap targets. */
export function Stepper({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = 10,
  className,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  className?: string;
}) {
  const btn =
    "inline-flex size-11 items-center justify-center rounded-control border border-border bg-surface text-text transition-colors duration-150 ease-out hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div
      className={cn("flex items-center justify-between gap-4", className)}
      role="group"
      aria-label={label}
    >
      <div>
        <div className="text-small font-semibold">{label}</div>
        {hint ? <div className="text-small text-muted">{hint}</div> : null}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={btn}
          aria-label={`Fewer ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          <Minus className="size-[18px]" strokeWidth={1.5} aria-hidden />
        </button>
        <output className="w-6 text-center font-semibold tabular-nums" aria-live="polite">
          {value}
        </output>
        <button
          type="button"
          className={btn}
          aria-label={`More ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Plus className="size-[18px]" strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}
