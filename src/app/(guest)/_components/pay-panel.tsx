"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, FlaskConical, RefreshCw } from "lucide-react";
import { Badge, Button, formatCountdown, HoldTimer } from "@/components/ui";
import { HOLD_WARNING_MS } from "@/components/ui/hold-latch";
import { formatInr } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  checkPayment,
  payBooking,
  refreshHold,
  type PayFormState,
  type RefreshState,
} from "../(site)/book/pay/actions";
import { PAY_COPY } from "../_lib/pay-flow";
import { clearStoredStay } from "../_lib/stay-storage";

const OPTIONS = [
  { value: "succeeds", label: "Payment succeeds", help: "The booking is confirmed." },
  { value: "declined", label: "Card declined", help: "Nothing is charged; you can try again." },
  { value: "timeout", label: "Bank times out", help: "No answer from the bank." },
] as const;

/**
 * B6 step 3 / B7: the mock payment card. Pay is disabled under 2 minutes left and "Refresh hold"
 * appears; the server rechecks both. The attempt id is rendered by the server, so a double click
 * reuses it; Retry after a decline or timeout takes a new one.
 */
export function PayPanel({
  bookingRef,
  totalPaise,
  holdExpiresAt,
  initialAttemptId,
  rebuildHref,
}: {
  bookingRef: string;
  totalPaise: number;
  holdExpiresAt: string;
  initialAttemptId: string;
  /** /rooms with the same cart, for "Build the stay again". */
  rebuildHref: string;
}) {
  const [payState, payAction, paying] = useActionState<PayFormState, FormData>(
    payBooking,
    undefined,
  );
  const [refreshState, refreshAction, refreshing] = useActionState<RefreshState, FormData>(
    refreshHold,
    undefined,
  );
  const [checked, setChecked] = useState<PayFormState>(undefined);
  const [checking, setChecking] = useState(false);
  const [attemptId, setAttemptId] = useState(initialAttemptId);
  const [outcome, setOutcome] = useState<(typeof OPTIONS)[number]["value"]>("succeeds");
  const [left, setLeft] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const [gated, setGated] = useState(false);
  /** Retry hides the last attempt's result until the next submit. */
  const [cleared, setCleared] = useState(false);

  // The cart has become a booking: forget the saved stay (B6 step 2 hand off).
  useEffect(() => clearStoredStay(), []);
  useEffect(() => {
    const tick = () => {
      const ms = Date.parse(holdExpiresAt) - Date.now();
      setLeft(ms);
      setGated(ms < HOLD_WARNING_MS);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [holdExpiresAt]);

  const step = cleared ? undefined : (checked ?? payState)?.step;
  const ended = expired || step?.kind === "ended";
  const serverGated = step?.kind === "gated";
  const blocked = gated || serverGated || ended;

  function retry() {
    setAttemptId(crypto.randomUUID());
    setChecked(undefined);
    setCleared(true);
  }

  async function check() {
    setChecking(true);
    try {
      setChecked(await checkPayment(bookingRef));
    } finally {
      setChecking(false);
    }
  }

  if (step?.kind === "refund-pending") {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-body">{PAY_COPY.refundPending}</p>
        <Link href={rebuildHref} className="font-semibold text-accent hover:underline">
          Build the stay again
        </Link>
      </div>
    );
  }

  if (ended) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-body">{PAY_COPY.ended}</p>
        <Link
          href={rebuildHref}
          className="inline-flex min-h-11 items-center font-semibold text-accent hover:underline"
        >
          Build the stay again
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <HoldTimer
          expiresAt={holdExpiresAt}
          onWarning={() => setGated(true)}
          onExpire={() => setExpired(true)}
        />
        <Badge tone="warning" icon={<FlaskConical strokeWidth={1.5} />}>
          Test mode
        </Badge>
      </div>
      <p className="text-small text-muted">
        Test mode: no real card is charged. Pick what the test bank should do.
      </p>

      <form
        action={(fd) => {
          setChecked(undefined);
          setCleared(false);
          startTransition(() => payAction(fd));
        }}
        className="flex flex-col gap-5"
      >
        <input type="hidden" name="ref" value={bookingRef} />
        <input type="hidden" name="attemptId" value={attemptId} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-small font-semibold">Test outcome</legend>
          {OPTIONS.map((o) => (
            <label
              key={o.value}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 rounded-control border p-3 transition-colors duration-150 ease-out",
                outcome === o.value
                  ? "border-accent bg-accent-soft"
                  : "border-border bg-surface hover:bg-surface-2",
              )}
            >
              <input
                type="radio"
                name="outcome"
                value={o.value}
                checked={outcome === o.value}
                onChange={() => setOutcome(o.value)}
                className="mt-1 size-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-body font-semibold">{o.label}</span>
                <span className="text-small text-muted">{o.help}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {step?.kind === "declined" ? (
          <p role="alert" className="flex items-start gap-2 text-small text-danger">
            <CircleAlert className="mt-0.5 size-[18px] shrink-0" strokeWidth={1.5} />
            {PAY_COPY.declined(formatCountdown(left ?? 0))}
          </p>
        ) : null}
        {step?.kind === "timeout" ? (
          <div role="alert" className="flex flex-col gap-2 text-small">
            <p className="flex items-start gap-2 text-warning">
              <CircleAlert className="mt-0.5 size-[18px] shrink-0" strokeWidth={1.5} />
              {PAY_COPY.timeout}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={checking}
                onClick={check}
              >
                Check status
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={retry}>
                Retry
              </Button>
            </div>
          </div>
        ) : null}
        {step?.kind === "error" ? (
          <p role="alert" className="text-small text-danger">
            {step.message}
          </p>
        ) : null}

        {step?.kind === "declined" || step?.kind === "timeout" ? (
          <p className="text-small text-muted">
            {step.kind === "declined"
              ? "Choose an outcome and pay again."
              : "Retry takes a new attempt; checking first avoids paying twice."}
          </p>
        ) : null}

        <Button
          type="submit"
          className="w-full"
          loading={paying}
          disabled={blocked || step?.kind === "timeout"}
        >
          Pay {formatInr(totalPaise)} (test mode)
        </Button>
      </form>

      {blocked && !ended ? (
        <form action={refreshAction} className="flex flex-col gap-2">
          <input type="hidden" name="ref" value={bookingRef} />
          <p className="text-small text-warning">
            Less than 2 minutes left on your hold. To avoid a payment arriving too late, refresh the
            hold first.
          </p>
          <Button type="submit" variant="secondary" loading={refreshing}>
            <RefreshCw className="size-[18px]" strokeWidth={1.5} aria-hidden />
            Refresh hold
          </Button>
          {refreshState?.message ? (
            <p role="alert" className="text-small text-danger">
              {refreshState.message}{" "}
              <Link href={rebuildHref} className="font-semibold text-accent hover:underline">
                Build the stay again
              </Link>
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
