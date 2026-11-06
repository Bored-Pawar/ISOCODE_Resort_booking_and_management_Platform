"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type StaffNavItem = { href: string; label: string; icon?: React.ReactNode; badge?: number };

export function StaffNav({
  items,
  orientation,
}: {
  items: StaffNavItem[];
  orientation: "vertical" | "horizontal";
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Staff"
      className={cn(
        orientation === "vertical" ? "flex flex-col gap-1" : "flex gap-1 overflow-x-auto",
      )}
    >
      {items.map((item) => {
        const active =
          pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-3 rounded-control px-3 text-small font-semibold whitespace-nowrap transition-colors duration-150 ease-out",
              active ? "bg-accent-soft text-accent" : "text-text hover:bg-surface-2",
            )}
          >
            <span aria-hidden className="[&>svg]:size-[18px]">
              {item.icon}
            </span>
            {item.label}
            {item.badge ? (
              <span className="ml-auto rounded-full bg-danger px-2 text-xs text-white tabular-nums">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
