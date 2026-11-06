import { cn } from "@/lib/utils";

/** Pulse block. Compose into shapes that match the final layout. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-control bg-surface-2", className)}
      {...props}
    />
  );
}

/** Matches a rooms-list card: 4:3 photo left (top on mobile), text right. */
export function RoomCardSkeleton() {
  return (
    <div
      className="grid overflow-hidden rounded-card border border-border bg-surface sm:grid-cols-[2fr_3fr]"
      role="status"
      aria-label="Loading room"
    >
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-auto h-9 w-40" />
      </div>
    </div>
  );
}

/** Matches a dense staff table. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading table">
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-11" />
          ))}
        </div>
      ))}
    </div>
  );
}
