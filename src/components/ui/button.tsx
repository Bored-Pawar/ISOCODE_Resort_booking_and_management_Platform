import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-foreground hover:bg-accent-hover",
        secondary: "border border-border bg-surface text-text hover:bg-surface-2",
        ghost: "text-text hover:bg-surface-2",
      },
      size: {
        md: "h-11 px-5 text-body",
        sm: "h-9 px-3 text-small",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Variants = VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & Variants & { loading?: boolean }) {
  return (
    <button
      type={type}
      // Loading is not "disabled" visually: keep full contrast so text and spinner stay readable.
      className={cn(
        buttonVariants({ variant, size }),
        loading && "disabled:cursor-wait disabled:opacity-100",
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-[18px] animate-spin" strokeWidth={1.5} aria-hidden />
      ) : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof Link> & Variants) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
