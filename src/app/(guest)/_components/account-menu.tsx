"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BedDouble, CalendarCheck, LogOut } from "lucide-react";
import { safeNext } from "@/lib/auth/safe-next";
import { signOutAction } from "@/lib/auth/actions";
import { stayHref } from "../_lib/cart";
import { useStoredStay } from "./use-stored-stay";

const linkClass =
  "inline-flex h-11 items-center rounded-control px-3 text-small font-semibold text-text hover:bg-surface-2";

/** The page the guest is on, as a safe same-site path for ?next=. */
function useCurrentPath(): string {
  const pathname = usePathname();
  const qs = useSearchParams().toString();
  return safeNext(qs ? `${pathname}?${qs}` : pathname, "/");
}

/** Signed out: "Sign in", returning to this page (and its cart) afterwards. */
export function SignInLink() {
  const here = useCurrentPath();
  const next = here === "/" ? "" : `?next=${encodeURIComponent(here)}`;
  return (
    <Link href={`/login${next}`} className={linkClass}>
      Sign in
    </Link>
  );
}

/** Signed in: initials button with My stay (cart badge), My bookings and Sign out. */
export function AccountMenu({ name, initials }: { name: string; initials: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const saved = useStoredStay();
  const rooms = saved?.lines.length ?? 0;
  const stayLink =
    saved?.checkIn && saved.checkOut
      ? stayHref(
          {
            checkIn: saved.checkIn,
            checkOut: saved.checkOut,
            ...(saved.party.adults >= 1 ? saved.party : { adults: 2, children: 0 }),
          },
          saved.lines,
        )
      : "/rooms";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex h-11 w-full items-center gap-3 rounded-control px-3 text-left text-small font-semibold text-text hover:bg-surface-2";
  const close = () => setOpen(false);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Your account, ${name}${rooms ? `, ${rooms} rooms in your stay` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex size-11 items-center justify-center rounded-full"
      >
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-accent-soft text-small font-semibold text-accent">
          {initials}
        </span>
        {rooms > 0 ? (
          <span
            aria-hidden
            className="absolute top-0 right-0 inline-flex size-5 items-center justify-center rounded-full bg-text text-xs font-semibold text-bg tabular-nums"
          >
            {rooms}
          </span>
        ) : null}
      </button>
      <div
        id={menuId}
        hidden={!open}
        className="absolute right-0 z-30 mt-2 w-60 rounded-card border border-border bg-surface p-2 shadow-[0_8px_24px_rgba(31,27,22,0.08)]"
      >
        <p className="truncate px-3 pt-1 pb-2 text-small text-muted">{name}</p>
        <ul className="flex flex-col">
          <li>
            <Link href={stayLink} className={item} onClick={close}>
              <BedDouble className="size-[18px] text-muted" strokeWidth={1.5} aria-hidden />
              <span className="flex-1">My stay</span>
              <span
                className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted tabular-nums"
                aria-label={`${rooms} rooms`}
              >
                {rooms}
              </span>
            </Link>
          </li>
          <li>
            <Link href="/account" className={item} onClick={close}>
              <CalendarCheck className="size-[18px] text-muted" strokeWidth={1.5} aria-hidden />
              My bookings
            </Link>
          </li>
          <li className="mt-1 border-t border-border pt-1">
            <form action={signOutAction}>
              <button type="submit" className={item}>
                <LogOut className="size-[18px] text-muted" strokeWidth={1.5} aria-hidden />
                Sign out
              </button>
            </form>
          </li>
        </ul>
      </div>
    </div>
  );
}
