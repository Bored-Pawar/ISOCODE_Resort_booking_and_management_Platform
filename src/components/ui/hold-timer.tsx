"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/** "Held for you · 08:42". Turns warning under 2 minutes. Calls onExpire once at zero. */
export function HoldTimer({
  expiresAt,
  onExpire,
  className,
}: {
  /** ISO timestamp from the booking hold. */
  expiresAt: string;
  onExpire?: () => void;
  className?: string;
}) {
  const target = new Date(expiresAt).getTime();
  const [remaining, setRemaining] = useState<number | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    fired.current = false;
    const tick = () => {
      const left = target - Date.now();
      setRemaining(left);
      if (left <= 0 && !fired.current) {
        fired.current = true;
        onExpire?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, onExpire]);

  if (remaining === null)
    return <span className={cn("inline-block h-5 w-40", className)} aria-hidden />;
  const expired = remaining <= 0;
  const low = !expired && remaining < 120_000;

  return (
    <p
      role="timer"
      className={cn(
        "inline-flex items-center gap-2 text-small font-semibold tabular-nums",
        expired ? "text-danger" : low ? "text-warning" : "text-text",
        className,
      )}
    >
      <Clock aria-hidden className="size-[18px]" strokeWidth={1.5} />
      {expired ? "Hold expired" : <>Held for you · {formatCountdown(remaining)}</>}
      {low ? <span className="font-normal"> (under 2 minutes)</span> : null}
    </p>
  );
}
