import Link from "next/link";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Brand name in the display font. Name comes from src/lib/site.ts. */
export function Wordmark({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("font-display text-h2 font-medium text-text", className)}>
      {site.name}
    </Link>
  );
}
