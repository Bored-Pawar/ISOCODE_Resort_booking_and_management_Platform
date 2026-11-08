"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { FieldNote, Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitEnquiryAction } from "../(site)/enquire/actions";
import type { EnquiryPrefill } from "../_lib/enquiry";

/** Short enquiry form. Plain client state only; validation lives on the server (Zod). */
export function EnquiryForm({
  today,
  defaults,
  roomName,
}: {
  today: string;
  defaults: EnquiryPrefill;
  roomName?: string;
}) {
  const [state, action, pending] = useActionState(submitEnquiryAction, undefined);

  if (state?.sent) {
    return (
      <div role="status" className="flex flex-col items-start gap-3">
        <CheckCircle2 className="size-8 text-success" strokeWidth={1.5} aria-hidden />
        <h2 className="text-h2 font-medium">Thank you, we have your enquiry</h2>
        <p className="max-w-read text-body text-muted">
          Our team will reply within a day.
          {state.sent.enquiryId ? (
            <>
              {" "}
              Your reference is{" "}
              <strong className="font-semibold text-text">{state.sent.enquiryId}</strong>.
            </>
          ) : null}
        </p>
        <ButtonLink href="/rooms" variant="secondary">
          Browse rooms
        </ButtonLink>
      </div>
    );
  }

  const v = state?.values;
  const errs = state?.fieldErrors;
  const val = (key: string, fallback: string | number | undefined) =>
    v ? v[key] : fallback === undefined ? "" : String(fallback);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {defaults.room ? <input type="hidden" name="room" value={defaults.room} /> : null}
      {roomName ? (
        <p className="text-small text-muted">
          About: <strong className="font-semibold text-text">{roomName}</strong>
        </p>
      ) : null}
      {defaults.rooms ? (
        <>
          <input type="hidden" name="rooms" value={defaults.rooms} />
          <p className="text-small text-muted">
            Rooms in mind:{" "}
            <strong className="font-semibold text-text">
              {defaults.rooms} {defaults.rooms === 1 ? "room" : "rooms"}
            </strong>
          </p>
        </>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Input
          name="name"
          label="Your name"
          autoComplete="name"
          required
          defaultValue={val("name", "")}
          error={errs?.name}
        />
        <Input
          name="contact"
          label="Email or phone"
          autoComplete="email"
          required
          defaultValue={val("contact", "")}
          error={errs?.contact}
        />
      </div>

      <Textarea
        name="message"
        label="Your message"
        rows={5}
        required
        help="Occasion, group size, anything we should know."
        defaultValue={val("message", "")}
        error={errs?.message}
      />

      <fieldset className="flex flex-col gap-4">
        <legend className="text-small font-semibold">Dates and guests (optional)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="checkIn"
            type="date"
            label="Check-in"
            min={today}
            defaultValue={val("checkIn", defaults.checkIn)}
            error={errs?.checkIn}
          />
          <Input
            name="checkOut"
            type="date"
            label="Check-out"
            min={today}
            defaultValue={val("checkOut", defaults.checkOut)}
            error={errs?.checkOut}
          />
          <Input
            name="adults"
            type="number"
            inputMode="numeric"
            min={0}
            label="Adults"
            defaultValue={val("adults", defaults.adults)}
            error={errs?.adults}
          />
          <Input
            name="children"
            type="number"
            inputMode="numeric"
            min={0}
            label="Children"
            defaultValue={val("children", defaults.children)}
            error={errs?.children}
          />
        </div>
      </fieldset>

      {/* Honeypot: hidden from people and assistive tech, bots fill it. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-3 text-small">
          <input
            type="checkbox"
            name="consent"
            className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
            aria-invalid={errs?.consent ? true : undefined}
            defaultChecked={false}
          />
          <span>
            I agree that Company A may store my name and contact details to reply to this enquiry,
            as described in the privacy notice (DPDP Act 2023). I can ask for my data to be deleted
            at any time.
          </span>
        </label>
        <FieldNote error={errs?.consent} />
      </div>

      {state?.error ? (
        <p role="alert" className="text-small text-danger">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" loading={pending}>
          Send enquiry
        </Button>
        <Link href="/rooms" className="text-small text-muted underline underline-offset-2">
          Prefer to book online?
        </Link>
      </div>
    </form>
  );
}
