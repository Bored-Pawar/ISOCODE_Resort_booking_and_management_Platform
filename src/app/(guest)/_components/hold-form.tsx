"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Button, ErrorState, Input } from "@/components/ui";
import { formatInr } from "@/lib/money";
import { holdStay, type HoldFormState } from "../(site)/book/actions";

/**
 * Signed-in step 2: name and email (read only), editable phone, consent on file, then
 * "Hold my rooms". Every outcome that keeps the guest here is handled inline; the server action
 * redirects for the rest (pay page, or /rooms with a notice).
 */
export function HoldForm({
  query,
  name,
  email,
  phone,
  consentLine,
  totalPaise,
  enquiryHref,
  holdMinutes,
}: {
  /** The details URL query: cart, dates, group, promo and quoteHash. */
  query: string;
  name: string;
  email: string;
  phone: string | null;
  consentLine: string;
  /** The total the summary shows (the "old" total if the price changed at hold time). */
  totalPaise: number;
  enquiryHref: string;
  holdMinutes: number;
}) {
  const [state, formAction, pending] = useActionState<HoldFormState, FormData>(holdStay, undefined);
  const [currentQuery, setCurrentQuery] = useState(query);
  const form = useRef<HTMLFormElement>(null);
  const step = state?.step;

  /** "Continue at ₹x": take the new price's hash into the URL and submit again. */
  function continueAtNewPrice(quoteHash: string) {
    const params = new URLSearchParams(currentQuery);
    params.set("quoteHash", quoteHash);
    const next = params.toString();
    setCurrentQuery(next);
    window.history.replaceState(null, "", `/book/details?${next}`);
    const data = new FormData(form.current ?? undefined);
    data.set("query", next);
    startTransition(() => formAction(data));
  }

  return (
    <form ref={form} action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="query" value={currentQuery} />
      <input type="hidden" name="phoneBefore" value={phone ?? ""} />
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-small font-semibold">Name</dt>
          <dd className="text-body">{name}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-small font-semibold">Email</dt>
          <dd className="truncate text-body">{email}</dd>
        </div>
      </dl>
      <Input
        label="Phone (optional)"
        name="phone"
        type="tel"
        autoComplete="tel"
        defaultValue={phone ?? ""}
        help="For questions about your stay only."
        error={state?.phoneError}
      />
      <p className="text-small text-muted">{consentLine}</p>
      <p className="text-small text-muted">
        We only ask for what we need for your stay. Passport details for foreign guests are taken at
        check in.
      </p>

      {step?.kind === "price-changed" ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-card border border-warning p-4 text-small"
        >
          <p className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 size-[18px] shrink-0 text-warning" strokeWidth={1.5} />
            <span>
              The price for these rooms changed since you chose them. It was{" "}
              <span className="font-semibold tabular-nums">{formatInr(totalPaise)}</span>, it is now{" "}
              <span className="font-semibold tabular-nums">{formatInr(step.totalPaise)}</span> incl.{" "}
              {formatInr(step.gstPaise)} GST. Nothing is held yet.
            </span>
          </p>
          <Button
            type="button"
            loading={pending}
            onClick={() => continueAtNewPrice(step.quoteHash)}
            className="self-start"
          >
            Continue at {formatInr(step.totalPaise)}
          </Button>
        </div>
      ) : null}

      {step?.kind === "window" ? (
        <p role="alert" className="text-small text-danger">
          {step.message}{" "}
          <Link href={enquiryHref} className="font-semibold text-accent hover:underline">
            Send us an enquiry
          </Link>
        </p>
      ) : null}

      {step?.kind === "error" ? (
        <ErrorState
          title="We could not hold your rooms"
          message="Something in the request was not right. Nothing was held or charged. Please try again."
          onRetry={() => form.current?.requestSubmit()}
          className="py-6"
        />
      ) : null}

      {step?.kind === "price-changed" ? null : (
        <Button type="submit" loading={pending} className="w-full sm:w-auto sm:self-start">
          Hold my rooms
        </Button>
      )}
      <p className="text-small text-muted">
        Your rooms are held for {holdMinutes} minutes while you pay. Nothing is charged until the
        next step.
      </p>
    </form>
  );
}
