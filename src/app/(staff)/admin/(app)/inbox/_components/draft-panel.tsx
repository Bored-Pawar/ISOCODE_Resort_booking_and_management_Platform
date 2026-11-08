"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Send, Sparkles } from "lucide-react";
import { Badge, Button, Card, Textarea, useToast } from "@/components/ui";
import { formatInr } from "@/lib/money";
import type { Draft } from "@/modules/enquiries";
import { addsNewPrice, PRICE_WARNING } from "@/modules/enquiries/staff/rules";
import { approveAndSendAction, closeAction, regenerateAction, saveDraftAction } from "../actions";

type Quote = {
  checkIn?: string;
  checkOut?: string;
  totalPaise?: number;
  gstPaise?: number;
  lines?: { adults: number; children: number }[];
};

/** Rupee text the server quote supplies, for the live "new price figure" warning. */
function quoteText(q: Quote | null): string {
  if (!q) return "";
  return [q.totalPaise, q.gstPaise]
    .filter((n): n is number => typeof n === "number")
    .map(formatInr)
    .join(" ");
}

const sentAt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

/**
 * Q6 (remounted by the page when the stored draft changes). The R4 draft with the server quote marked "From the rate table". Save draft, Regenerate,
 * Approve and send (confirm dialog with the channel and final text). Never sends by itself.
 */
export function DraftPanel({
  enquiryId,
  draft,
  canWork,
  channelLabel,
  recipient,
  approverName,
}: {
  enquiryId: string;
  draft: Draft | null;
  canWork: boolean;
  channelLabel: string;
  recipient: string;
  approverName: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [body, setBody] = useState(draft?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const quote = (draft?.quote ?? null) as Quote | null;
  const warn = addsNewPrice(quoteText(quote), body);
  const dirty = !!draft && body.trim() !== draft.body;

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.message);
      else {
        toast(res.message, "success");
        after?.();
        router.refresh();
      }
    });

  if (draft?.sentAt)
    return (
      <Card>
        <h2 className="mb-2 text-h2">Reply sent</h2>
        <p className="mb-3 text-small text-muted">
          Sent {sentAt.format(new Date(draft.sentAt))} by {approverName ?? "staff"} to the mock
          outbox ({channelLabel}). {draft.edited ? "Edited by staff before sending." : ""}
        </p>
        <p className="rounded-control border border-border bg-surface-2 p-3 whitespace-pre-wrap">
          {draft.body}
        </p>
      </Card>
    );

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h2">Reply draft</h2>
        {draft ? (
          <Badge tone="neutral">
            {draft.provider === "staff" ? "Template" : `Drafted by ${draft.provider}`}
            {draft.edited ? " · edited" : ""}
          </Badge>
        ) : null}
      </div>
      {!draft ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-small text-muted">
            No draft yet. Generate one from the saved details; prices come only from the rate table.
          </p>
          {canWork ? (
            <Button
              variant="secondary"
              loading={pending}
              onClick={() => run(() => regenerateAction({ enquiryId }))}
            >
              <Sparkles className="size-4" strokeWidth={1.5} aria-hidden />
              Generate draft
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          {quote?.totalPaise !== undefined ? (
            <div className="mb-3 rounded-control border border-accent/30 bg-accent-soft p-3 text-small">
              <p className="font-semibold text-accent">From the rate table</p>
              <p className="tabular-nums">
                {quote.checkIn} to {quote.checkOut}: {formatInr(quote.totalPaise)} including{" "}
                {formatInr(quote.gstPaise ?? 0)} GST, room only. Indicative, no room is held.
              </p>
            </div>
          ) : (
            <p className="mb-3 text-small text-muted">
              No price in this draft: the rate table had nothing to quote for these details.
            </p>
          )}
          <Textarea
            label="Reply"
            rows={8}
            value={body}
            maxLength={5000}
            disabled={!canWork || pending}
            onChange={(e) => setBody(e.target.value)}
          />
          {warn ? (
            <p role="status" className="mt-2 flex items-center gap-1 text-small text-warning">
              <AlertTriangle className="size-4" strokeWidth={1.5} aria-hidden />
              {PRICE_WARNING}. This reply has a rupee figure that is not in the quote.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 text-small text-danger">
              {error}
            </p>
          ) : null}
          {canWork ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!dirty}
                loading={pending}
                onClick={() => run(() => saveDraftAction({ enquiryId, body }))}
              >
                Save draft
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={pending}
                onClick={() => run(() => regenerateAction({ enquiryId }))}
              >
                <Sparkles className="size-4" strokeWidth={1.5} aria-hidden />
                Regenerate
              </Button>
              <Button
                size="sm"
                disabled={!body.trim() || pending}
                onClick={() => dialog.current?.showModal()}
              >
                <Send className="size-4" strokeWidth={1.5} aria-hidden />
                Approve and send
              </Button>
            </div>
          ) : null}
          <dialog
            ref={dialog}
            aria-labelledby="send-title"
            className="m-auto w-[min(560px,calc(100vw-32px))] rounded-card border border-border bg-surface p-5 text-text shadow-[0_8px_24px_rgba(31,27,22,0.08)] backdrop:bg-text/30"
          >
            <h2 id="send-title" className="text-h2">
              Send this reply?
            </h2>
            <p className="mt-1 text-small text-muted">
              To {recipient} by {channelLabel}, through the mock outbox. Nothing is emailed or
              messaged.
            </p>
            <p className="mt-3 max-h-64 overflow-y-auto rounded-control border border-border bg-surface-2 p-3 whitespace-pre-wrap">
              {body.trim()}
            </p>
            {warn ? <p className="mt-2 text-small text-warning">{PRICE_WARNING}.</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => dialog.current?.close()}>
                Cancel
              </Button>
              <Button
                loading={pending}
                onClick={() =>
                  run(
                    () => approveAndSendAction({ enquiryId, draftId: draft.id, body }),
                    () => dialog.current?.close(),
                  )
                }
              >
                Approve and send
              </Button>
            </div>
          </dialog>
        </>
      )}
    </Card>
  );
}

/** Close: logs `closed`. */
export function CloseButton({ enquiryId }: { enquiryId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await closeAction({ enquiryId });
          toast(res.message, res.ok ? "success" : "error");
          if (res.ok) router.refresh();
        })
      }
    >
      Close enquiry
    </Button>
  );
}
