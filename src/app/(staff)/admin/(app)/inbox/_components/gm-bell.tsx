"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell as BellIcon, ShieldAlert, Inbox } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Bell } from "@/modules/enquiries";
import { formatWaiting } from "@/modules/enquiries/staff/display";
import { bellAction, markAllReadAction, markReadAction } from "../bell-actions";

/**
 * Q7 GM bell: unread count, complaint and unsorted alerts with summary and link, mark one or all
 * read. No polling: it reloads on every navigation (the staff layout itself stays mounted).
 */
export function GmBell({ initial }: { initial: Bell }) {
  const pathname = usePathname();
  const [data, setData] = useState(initial);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const first = useRef(true);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let live = true;
    bellAction().then((b) => {
      if (live && b) setData(b);
    });
    return () => {
      live = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === "Escape" : !panel.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const apply = (p: Promise<Bell | null>) =>
    start(async () => {
      const b = await p;
      if (b) setData(b);
    });
  const now = new Date().toISOString();

  return (
    <div ref={panel} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={data.unread ? `Alerts, ${data.unread} unread` : "Alerts, none unread"}
        onClick={() => setOpen((o) => !o)}
        className="relative flex size-11 items-center justify-center rounded-control text-text hover:bg-surface-2"
      >
        <BellIcon className="size-[18px]" strokeWidth={1.5} aria-hidden />
        {data.unread ? (
          <span className="absolute top-1 right-1 min-w-5 rounded-full bg-danger px-1 text-center text-xs font-semibold text-white tabular-nums">
            {data.unread > 99 ? "99+" : data.unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="GM alerts"
          className="absolute right-0 z-40 mt-2 w-[min(380px,calc(100vw-32px))] rounded-card border border-border bg-surface shadow-[0_8px_24px_rgba(31,27,22,0.08)]"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <p className="text-small font-semibold">
              Alerts{" "}
              {data.unread ? <span className="text-muted">· {data.unread} unread</span> : null}
            </p>
            <Button
              variant="ghost"
              size="sm"
              disabled={!data.unread}
              loading={pending}
              onClick={() => apply(markAllReadAction())}
            >
              Mark all read
            </Button>
          </div>
          {data.items.length ? (
            <ul className="max-h-[60vh] overflow-y-auto">
              {data.items.map((it) => (
                <li
                  key={it.id}
                  className={cn(
                    "flex gap-3 border-b border-border px-4 py-3 last:border-0",
                    !it.read && "bg-accent-soft/40",
                  )}
                >
                  <span
                    aria-hidden
                    className={it.kind === "complaint" ? "text-danger" : "text-warning"}
                  >
                    {it.kind === "complaint" ? (
                      <ShieldAlert className="size-[18px]" strokeWidth={1.5} />
                    ) : (
                      <Inbox className="size-[18px]" strokeWidth={1.5} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/inbox/${encodeURIComponent(it.enquiryId)}?lane=${it.kind === "complaint" ? "complaints" : "unsorted"}`}
                      onClick={() => {
                        setOpen(false);
                        if (!it.read) apply(markReadAction({ id: it.id }));
                      }}
                      className="block text-small font-semibold hover:underline"
                    >
                      {it.kind === "complaint" ? "Complaint" : "Unsorted"} · {it.senderName}
                    </Link>
                    <p className="truncate text-small text-muted">{it.summary}</p>
                    <p className="text-xs text-muted tabular-nums">
                      {it.enquiryId} · {formatWaiting(it.createdAt, now)} ago
                    </p>
                  </div>
                  {!it.read ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => apply(markReadAction({ id: it.id }))}
                      aria-label={`Mark ${it.enquiryId} read`}
                    >
                      Mark read
                    </Button>
                  ) : (
                    <span className="shrink-0 self-center text-xs text-muted">Read</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-small text-muted">No alerts. Good.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
