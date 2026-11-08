"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CartLine, CartStay } from "../_lib/cart";
import { EXPLORE_ROOMS, stayNav, type StayNav } from "../_lib/room-detail";
import { useStoredStay } from "./use-stored-stay";

/** The quiet text link under the room page actions. Not a button: "Add to my stay" is the one primary. */
export function StayNavText({ nav, className }: { nav: StayNav; className?: string }) {
  return (
    <Link
      href={nav.href}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 text-small font-semibold text-accent underline-offset-4 hover:underline",
        className,
      )}
    >
      {nav.kind === "back" ? <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden /> : null}
      {nav.label}
    </Link>
  );
}

/** "Back to my stay" when there is a cart (link or this browser), else "Explore more rooms". */
export function StayNavLink({
  url,
  className,
}: {
  /** Null when no dates are chosen: then the guest only explores. */
  url: { hasCartParam: boolean; stay: CartStay; lines: CartLine[] } | null;
  className?: string;
}) {
  const saved = useStoredStay();
  return <StayNavText nav={url ? stayNav(url, saved) : EXPLORE_ROOMS} className={className} />;
}
