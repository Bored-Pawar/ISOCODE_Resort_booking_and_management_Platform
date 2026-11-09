"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, useToast } from "@/components/ui";
import type { Extracted, RoomView } from "@/modules/enquiries";
import type { Evidence } from "@/modules/enquiries/staff/display";
import { EvidenceBadge } from "./badges";
import { saveFieldsAction } from "../actions";

const num = (v: string) => (v.trim() === "" ? null : Number(v));

const ROOM_HELP: Record<RoomView["source"], string> = {
  message:
    "From the guest's message. Type another room to replace it, or empty it to ask the guest.",
  staff: "Set by staff. Empty it to ask the guest instead of quoting a room.",
  cleared: "Cleared by staff: the draft asks the guest which room they want.",
};

/**
 * Q5 extracted fields. Saving logs `edited`; a dates, guests or room change rebuilds the draft.
 * The Room box shows the room the quote uses, so leaving it as shown keeps the guest's own choice.
 */
export function FieldsForm({
  enquiryId,
  extracted,
  room,
  canEdit,
}: {
  enquiryId: string;
  extracted: Extracted;
  room: RoomView;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const edited = new Set(extracted.staffEdited ?? []);
  const g = extracted.grounding ?? {};
  const ev = (field: "dates" | "guests" | "room"): Evidence =>
    edited.has(field) ? "staff" : ((g[field] as Evidence | undefined) ?? "missing");
  const [f, setF] = useState({
    from: extracted.dates?.from ?? "",
    to: extracted.dates?.to ?? "",
    adults: extracted.guests?.adults?.toString() ?? "",
    children: extracted.guests?.children?.toString() ?? "",
    budget: extracted.budget?.amountInr?.toString() ?? "",
    room: room.text ?? "",
    language: extracted.language ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if ((f.from && !f.to) || (!f.from && f.to)) return setError("Give both dates, or neither.");
    if (!f.adults && f.children) return setError("Add the number of adults.");
    start(async () => {
      const res = await saveFieldsAction({
        enquiryId,
        dates: f.from && f.to ? { from: f.from, to: f.to } : null,
        guests: f.adults ? { adults: num(f.adults), children: num(f.children) ?? 0 } : null,
        budgetInr: num(f.budget),
        room: f.room.trim() || null,
        language: f.language.trim() || null,
      });
      if (!res.ok) setError(res.message);
      else {
        toast(res.message, "success");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        <EvidenceBadge label="Dates" value={ev("dates")} />
        <EvidenceBadge label="Guests" value={ev("guests")} />
        <EvidenceBadge label="Room" value={ev("room")} />
      </div>
      {extracted.dates?.text ? (
        <p className="text-small text-muted">Guest wrote: {extracted.dates.text}</p>
      ) : null}
      <fieldset disabled={!canEdit || pending} className="grid gap-3 sm:grid-cols-2">
        <Input label="Check-in" type="date" value={f.from} onChange={set("from")} />
        <Input
          label="Check-out"
          type="date"
          value={f.to}
          onChange={set("to")}
          min={f.from || undefined}
        />
        <Input
          label="Adults"
          type="number"
          min={1}
          max={40}
          inputMode="numeric"
          value={f.adults}
          onChange={set("adults")}
        />
        <Input
          label="Children"
          type="number"
          min={0}
          max={40}
          inputMode="numeric"
          value={f.children}
          onChange={set("children")}
        />
        <Input
          label="Budget (₹)"
          type="number"
          min={1}
          inputMode="numeric"
          value={f.budget}
          onChange={set("budget")}
          help={extracted.budget?.text ? `Guest wrote: ${extracted.budget.text}` : undefined}
        />
        <Input
          label="Room"
          value={f.room}
          onChange={set("room")}
          maxLength={60}
          placeholder="For example Pool Villa"
          help={ROOM_HELP[room.source]}
        />
        <Input label="Language" value={f.language} onChange={set("language")} maxLength={40} />
      </fieldset>
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" size="sm" loading={pending}>
            Save fields
          </Button>
          <span className="text-xs text-muted">
            Changing dates, guests or room rebuilds the unsent draft.
          </span>
        </div>
      ) : null}
    </form>
  );
}
