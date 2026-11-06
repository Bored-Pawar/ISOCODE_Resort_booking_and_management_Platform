import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-muted",
        accent: "bg-accent-soft text-accent",
        success: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
        danger: "bg-danger/10 text-danger",
        coffee: "bg-coffee/10 text-coffee",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

/**
 * Category, channel, status, confidence. Status colours always pair with an icon or a word,
 * never colour alone, so pass `icon` for status tones.
 */
export function Badge({
  className,
  tone,
  icon,
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { icon?: React.ReactNode }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {icon ? (
        <span aria-hidden className="inline-flex [&>svg]:size-3.5">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
