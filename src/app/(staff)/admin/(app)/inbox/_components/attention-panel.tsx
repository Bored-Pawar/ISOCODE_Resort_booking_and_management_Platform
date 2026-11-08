"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Megaphone } from "lucide-react";
import { Button, Card, Textarea, useToast } from "@/components/ui";
import { NOTE_MAX } from "@/modules/enquiries/staff/rules";
import { requestAttentionAction, resolveAttentionAction } from "../actions";

/**
 * 2.5 attention request. Sales and GM ask reservations and the GM to look (required note); while
 * it is open, reservations and the GM see the note and "Mark seen" with a reply note.
 */
export function AttentionPanel({
  enquiryId,
  open,
  request,
  canRequest,
  canResolve,
}: {
  enquiryId: string;
  open: boolean;
  request: { note: string; by: string } | null;
  canRequest: boolean;
  canResolve: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!(open && (canResolve || request)) && !canRequest) return null;

  const submit = (fn: typeof requestAttentionAction) =>
    start(async () => {
      setError(null);
      if (!note.trim()) return setError("Add a short note.");
      const res = await fn({ enquiryId, note });
      if (!res.ok) setError(res.message);
      else {
        toast(res.message, "success");
        setNote("");
        setWriting(false);
        router.refresh();
      }
    });

  const noteField = (label: string) => (
    <Textarea
      label={label}
      rows={3}
      value={note}
      maxLength={NOTE_MAX}
      onChange={(e) => setNote(e.target.value)}
      help={`${note.length} / ${NOTE_MAX}`}
      error={error ?? undefined}
    />
  );

  if (open)
    return (
      <Card className="border-warning/40">
        <h2 className="flex items-center gap-2 text-h2">
          <Megaphone className="size-5 text-warning" strokeWidth={1.5} aria-hidden />
          Needs attention
        </h2>
        {request ? (
          <p className="mt-2 text-small">
            <span className="font-semibold">{request.by}</span> asked reservations and the GM to
            look:
          </p>
        ) : null}
        {request ? (
          <p className="mt-1 rounded-control bg-surface-2 px-3 py-2 whitespace-pre-wrap">
            {request.note}
          </p>
        ) : null}
        {canResolve ? (
          <div className="mt-3 flex flex-col gap-2">
            {noteField("Reply note")}
            <Button
              size="sm"
              variant="secondary"
              className="self-start"
              loading={pending}
              onClick={() => submit(resolveAttentionAction)}
            >
              <Eye className="size-4" strokeWidth={1.5} aria-hidden />
              Mark seen
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-small text-muted">Waiting for reservations or the GM.</p>
        )}
      </Card>
    );

  return (
    <Card>
      {writing ? (
        <div className="flex flex-col gap-2">
          {noteField("What should reservations and the GM look at?")}
          <div className="flex gap-2">
            <Button size="sm" loading={pending} onClick={() => submit(requestAttentionAction)}>
              Send request
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setWriting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setWriting(true)}>
          <Megaphone className="size-4" strokeWidth={1.5} aria-hidden />
          Ask reservations and GM to look
        </Button>
      )}
    </Card>
  );
}
