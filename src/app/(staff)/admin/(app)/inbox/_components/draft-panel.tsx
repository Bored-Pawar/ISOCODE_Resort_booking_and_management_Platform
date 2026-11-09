"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw, Send, Sparkles } from "lucide-react";
import { Badge, Button, Card, Textarea, useToast } from "@/components/ui";
import { formatInr } from "@/lib/money";
import type { Draft } from "@/modules/enquiries";
import { addsNewPrice, PRICE_WARNING } from "@/modules/enquiries/staff/display";
import {
  approveAndSendAction,
  closeAction,
  rebuildQuoteAction,
  regenerateAction,
  saveDraftAction,
} from "../actions";

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

const OUTDATED: Record<"rebuilding" | "failed" | "stale", { title: string; text: string }> = {
  rebuilding: {
    title: "Quote being rebuilt",
    text: "The saved details changed and the quote is being rebuilt. Approve is off until it finishes. If this does not clear after a refresh, use Retry.",
  },
  failed: {
    title: "Quote out of date",
    text: "The quote could not be rebuilt from the saved details, so this draft cannot be sent. Use Retry.",
  },
  stale: {
    title: "Quote out of date",
    text: "The saved details changed after this draft was priced, so it cannot be sent. Use Retry to rebuild it.",
  },
};

/** "15 Dec to 17 Dec 2026 · 3 adults, 1 child · Pool Villa (set by staff)" */
function builtOnText(b: NonNullable<Draft["builtOn"]>): string {
  const parts = [
    b.dates ? `${b.dates.from} to ${b.dates.to}` : "dates not given",
    b.guests
      ? `${b.guests.adults} adults, ${b.guests.children} ${b.guests.children === 1 ? "child" : "children"}`
      : "party not given",
    b.room.source === "cleared"
      ? "no room (cleared by staff)"
      : b.room.text
        ? `${b.room.text} (${b.room.source === "staff" ? "set by staff" : "guest's message"})`
        : "no room named",
  ];
  return parts.join(" · ");
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
  const quoteState = draft?.quoteState ?? "current";
  const outdated = quoteState === "current" ? null : OUTDATED[quoteState];

  const run = (
    fn: () => Promise<{ ok: boolean; message: string; stale?: boolean }>,
    after?: () => void,
  ) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok && res.stale) {
        // The panel remounts with the new draft (keyed by its version), so say it in a toast.
        dialog.current?.close();
        toast(res.message, "error");
        router.refresh();
      } else if (!res.ok) setError(res.message);
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
          {outdated ? (
            <div
              role="alert"
              className="mb-3 flex flex-col items-start gap-2 rounded-control border border-warning/40 bg-warning/10 p-3 text-small"
            >
              <p className="flex items-center gap-1 font-semibold text-warning">
                <AlertTriangle className="size-4" strokeWidth={1.5} aria-hidden />
                {outdated.title}
              </p>
              <p>{outdated.text}</p>
              {canWork ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={pending}
                  onClick={() => run(() => rebuildQuoteAction({ enquiryId }))}
                >
                  <RefreshCw className="size-4" strokeWidth={1.5} aria-hidden />
                  Retry
                </Button>
              ) : null}
            </div>
          ) : null}
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
          {draft.builtOn ? (
            <p className="mb-3 text-small text-muted">
              {outdated ? "This draft was built on: " : "Built on the saved details: "}
              {builtOnText(draft.builtOn)}
            </p>
          ) : null}
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
                onClick={() =>
                  run(() => saveDraftAction({ enquiryId, body, version: draft.version }))
                }
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
                disabled={!body.trim() || pending || !!outdated}
                title={outdated ? "Rebuild the quote first (Retry)" : undefined}
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
                disabled={!!outdated}
                onClick={() =>
                  run(
                    () =>
                      approveAndSendAction({
                        enquiryId,
                        draftId: draft.id,
                        body,
                        version: draft.version,
                      }),
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
