import type { StaffUser, TimelineEntry } from "@/modules/enquiries";
import { isAttentionRequest, isAttentionResolve } from "@/modules/enquiries/staff/rules";
import { CATEGORY_LABEL, CHANNEL_LABEL } from "./badges";

const at = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

const cat = (v: string | null) =>
  v && v in CATEGORY_LABEL ? CATEGORY_LABEL[v as keyof typeof CATEGORY_LABEL] : (v ?? "unsorted");

const FIELD = {
  dates: "dates",
  guests: "guests",
  budget: "budget",
  room: "room",
  language: "language",
} as Record<string, string>;

/** One line per `enquiry_events` row, plus its note when it has one. */
export function describe(
  e: TimelineEntry,
  names: Map<string, string>,
): { text: string; note?: string } {
  if (isAttentionRequest(e))
    return { text: "Asked reservations and the GM to look", note: e.fromValue ?? undefined };
  if (isAttentionResolve(e))
    return { text: "Marked seen", note: e.toValue?.replace(/^seen: /, "") || undefined };
  switch (e.action) {
    case "classified":
      return { text: `Classified as ${cat(e.toValue)}` };
    case "rerouted":
      if (e.fromValue?.startsWith("owner:") || e.toValue?.startsWith("owner:")) {
        const to = names.get(e.toValue?.slice(6) ?? "") ?? "another owner";
        return { text: `Owner changed to ${to}` };
      }
      return { text: `Re-routed from ${cat(e.fromValue)} to ${cat(e.toValue)}` };
    case "edited":
      if (e.fromValue === "ai:failed") return { text: "Retried AI" };
      if (e.fromValue === "fields")
        return {
          text: `Edited ${(e.toValue ?? "")
            .split(",")
            .map((f) => FIELD[f] ?? f)
            .join(", ")}`,
        };
      if (e.toValue === "draft:regenerated") return { text: "Regenerated the draft" };
      return {
        text:
          e.toValue === "draft:price-warning"
            ? "Edited the draft (new price figure)"
            : "Edited the draft",
      };
    case "sent":
      return {
        text: `Approved and sent the reply${
          e.toValue && e.toValue in CHANNEL_LABEL
            ? ` (${CHANNEL_LABEL[e.toValue as keyof typeof CHANNEL_LABEL]}, mock outbox)`
            : ""
        }`,
      };
    case "closed":
      return { text: "Closed the enquiry" };
    default:
      return { text: e.action };
  }
}

export function Timeline({ events, staff }: { events: TimelineEntry[]; staff: StaffUser[] }) {
  if (!events.length) return <p className="text-small text-muted">No activity yet.</p>;
  const names = new Map(staff.map((u) => [u.id, u.name]));
  return (
    <ol className="flex flex-col gap-3">
      {events.map((e) => {
        const d = describe(e, names);
        return (
          <li key={e.id} className="border-l-2 border-border pl-3">
            <p className="text-small">
              <span className="font-semibold">{e.actor}</span> {d.text.charAt(0).toLowerCase()}
              {d.text.slice(1)}
            </p>
            {d.note ? (
              <p className="mt-1 rounded-control bg-surface-2 px-2 py-1 text-small whitespace-pre-wrap">
                {d.note}
              </p>
            ) : null}
            <p className="text-xs text-muted tabular-nums">{at.format(new Date(e.at))}</p>
          </li>
        );
      })}
    </ol>
  );
}
