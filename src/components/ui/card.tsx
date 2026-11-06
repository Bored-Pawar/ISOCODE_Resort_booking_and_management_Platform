import { cn } from "@/lib/utils";

/** Surface, border, 10px radius. No shadow (borders over shadows). */
export function Card({
  className,
  padded = true,
  ...props
}: React.ComponentProps<"div"> & { padded?: boolean }) {
  return (
    <div
      className={cn("rounded-card border border-border bg-surface", padded && "p-5", className)}
      {...props}
    />
  );
}
