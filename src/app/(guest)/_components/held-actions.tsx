"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink, useToast } from "@/components/ui";
import { cancelHeldBooking } from "@/modules/booking/actions";

/**
 * B9: a live hold on My bookings. Resume payment opens the pay page; Cancel asks first, then calls
 * the guest cancel action (owner checked on the server) and says what happened in a toast.
 */
export function HeldActions({ bookingId, bookingRef }: { bookingId: string; bookingRef: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  function cancel() {
    startTransition(async () => {
      try {
        const result = await cancelHeldBooking({ bookingId });
        dialog.current?.close();
        if (result.ok) {
          setDone(true);
          toast(`Booking ${bookingRef} cancelled. Your rooms were released.`, "success");
        } else if (result.code === "NOT_HELD") {
          toast(
            result.status === "CONFIRMED"
              ? `Booking ${bookingRef} was already paid and confirmed.`
              : `This hold had already ended.`,
            "info",
          );
        } else {
          toast("We could not cancel this booking. Please try again.", "error");
        }
        router.refresh();
      } catch {
        dialog.current?.close();
        toast("We could not cancel this booking. Please try again.", "error");
      }
    });
  }

  if (done) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <ButtonLink href={`/book/pay/${encodeURIComponent(bookingRef)}`} size="sm">
        Resume payment
      </ButtonLink>
      <Button variant="secondary" size="sm" onClick={() => dialog.current?.showModal()}>
        Cancel
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={`cancel-${bookingRef}`}
        className="m-auto w-[min(92vw,420px)] rounded-card border border-border bg-surface p-6 text-text shadow-[0_8px_24px_rgba(31,27,22,0.08)] backdrop:bg-text/30"
      >
        <h2 id={`cancel-${bookingRef}`} className="font-display text-h2 font-medium">
          Cancel booking {bookingRef}?
        </h2>
        <p className="mt-2 text-body text-muted">
          Your rooms will be released and nothing is charged. This cannot be undone.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => dialog.current?.close()} disabled={pending}>
            Keep it
          </Button>
          <Button onClick={cancel} loading={pending}>
            Cancel booking
          </Button>
        </div>
      </dialog>
    </div>
  );
}
