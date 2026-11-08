"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { createHoldLatch, holdPhase, type HoldCallbacks } from "./hold-latch";

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * "Held for you · 08:42". Turns warning under 2 minutes. onWarning and onExpire fire once per
 * expiresAt (R07): a new callback identity never re-arms them, a new expiresAt does.
 */
export function HoldTimer({
  expiresAt,
  onWarning,
  onExpire,
  className,
}: {
  /** ISO timestamp from the booking hold. */
  expiresAt: string;
  onWarning?: () => void;
  onExpire?: () => void;
  className?: string;
}) {
  const target = new Date(expiresAt).getTime();
  const [remaining, setRemaining] = useState<number | null>(null);
  const [latch] = useState(createHoldLatch);
  const callbacks = useRef<HoldCallbacks>({});

  // Latest callbacks without re-running the interval effect.
  useEffect(() => {
    callbacks.current = { onWarning, onExpire };
  }, [onWarning, onExpire]);

  useEffect(() => {
    const tick = () => setRemaining(latch.tick(target, Date.now(), callbacks.current));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, latch]);

  if (remaining === null)
    return <span className={cn("inline-block h-5 w-40", className)} aria-hidden />;
  const phase = holdPhase(remaining);

  return (
    <p
      role="timer"
      className={cn(
        "inline-flex items-center gap-2 text-small font-semibold tabular-nums",
        phase === "expired" ? "text-danger" : phase === "warning" ? "text-warning" : "text-text",
        className,
      )}
    >
      <Clock aria-hidden className="size-[18px]" strokeWidth={1.5} />
      {phase === "expired" ? "Hold expired" : <>Held for you · {formatCountdown(remaining)}</>}
      {phase === "warning" ? <span className="font-normal"> (under 2 minutes)</span> : null}
    </p>
  );
}
