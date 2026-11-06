import { cn } from "@/lib/utils";

const STEPS = ["Room", "Details", "Pay"] as const;

/** "1 Room · 2 Details · 3 Pay" with the current step in bold. */
export function StepIndicator({ current, className }: { current: 1 | 2 | 3; className?: string }) {
  return (
    <ol
      className={cn("flex flex-wrap items-center gap-x-2 text-small", className)}
      aria-label="Booking steps"
    >
      {STEPS.map((name, i) => {
        const n = i + 1;
        const isCurrent = n === current;
        return (
          <li
            key={name}
            className="flex items-center gap-2"
            aria-current={isCurrent ? "step" : undefined}
          >
            <span
              className={cn(
                isCurrent ? "font-semibold text-text" : "text-muted",
                n < current && "text-text",
              )}
            >
              <span className="tabular-nums">{n}</span> {name}
            </span>
            {n < STEPS.length ? (
              <span aria-hidden className="text-muted">
                ·
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
