import { Card } from "@/components/ui";
import { formatInr } from "@/lib/money";
import type { InboxActor, InboxDetail } from "@/modules/enquiries";
import {
  CATEGORIES,
  defaultOwnerRole,
  formatWaiting,
  ownerRolesFor,
} from "@/modules/enquiries/staff/rules";
import {
  AiBadge,
  CATEGORY_LABEL,
  CategoryBadge,
  ChannelBadge,
  CHANNEL_LABEL,
  ComplaintBadge,
  ConfidenceBadge,
  STATUS_LABEL,
  WaitingBadge,
} from "./badges";
import { FieldsForm } from "./fields-form";
import { RerouteForm, type RerouteOption } from "./reroute-form";
import { RetryForm } from "./retry-form";
import { Timeline } from "./timeline";

const when = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

const ROLE = { reservations: "Reservations", sales: "Sales", gm: "GM" } as const;

/** Owner choices per category, from permissions (complaints only the GM). */
function rerouteOptions(detail: InboxDetail): RerouteOption[] {
  const complaint = detail.enquiry.isComplaint;
  return CATEGORIES.map((category) => {
    const isComplaint = complaint || category === "complaint";
    const roles = ownerRolesFor(category, isComplaint);
    const users = detail.staff.filter((u) => roles.includes(u.role));
    const preferred = defaultOwnerRole(category, isComplaint);
    return {
      category,
      label: CATEGORY_LABEL[category],
      owners: users.map((u) => ({ id: u.id, label: `${u.name} (${ROLE[u.role]})` })),
      defaultOwnerId: (users.find((u) => u.role === preferred) ?? users[0])?.id ?? "",
    };
  });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 text-h2">{title}</h2>
      {children}
    </Card>
  );
}

/** Q5 detail. Slots for the draft (Q6) and attention (2.5) panels are passed in. */
export function Detail({
  detail,
  draftPanel,
  attentionPanel,
  closePanel,
}: {
  detail: InboxDetail;
  actor: InboxActor;
  draftPanel?: React.ReactNode;
  attentionPanel?: React.ReactNode;
  closePanel?: React.ReactNode;
}) {
  const q = detail.enquiry;
  const now = new Date().toISOString();
  const needs = Array.isArray(detail.event?.needs) ? (detail.event!.needs as string[]) : [];
  return (
    <article className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-h2">{q.senderName}</h2>
          <span className="text-small text-muted">{q.id}</span>
        </div>
        <p className="mt-1 text-small text-muted">
          {CHANNEL_LABEL[q.channel]} · {q.senderContact} · received{" "}
          {when.format(new Date(q.receivedAt))}
        </p>
        <div className="mt-3 flex flex-wrap gap-1">
          <CategoryBadge category={q.category} />
          <ChannelBadge channel={q.channel} />
          <ConfidenceBadge confidence={q.confidence} />
          {q.isComplaint ? <ComplaintBadge /> : null}
          <AiBadge status={q.aiStatus} />
          <WaitingBadge
            text={formatWaiting(q.receivedAt, q.firstReplyAt ?? now)}
            replied={!!q.firstReplyAt}
          />
        </div>
        <p className="mt-3 text-small">
          <span className="font-semibold">{STATUS_LABEL[q.status]}</span>
          {q.ownerName ? ` · owner ${q.ownerName}` : " · no owner"}
          {q.lane === "unsorted" ? " · unsorted" : ""}
        </p>
        <p className="mt-3 font-semibold">{q.summary}</p>
        <blockquote className="mt-3 rounded-control border border-border bg-surface-2 p-3 text-body whitespace-pre-wrap">
          {q.rawText}
        </blockquote>
        {detail.can.retry ? (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-small text-danger">
              AI failed after {q.aiAttempts} attempts. Retry resets the attempts and runs it again.
            </p>
            <RetryForm id={q.id} updatedAt={q.aiUpdatedAt} attempts={q.aiAttempts} />
          </div>
        ) : null}
      </Card>

      {attentionPanel}

      {detail.event ? (
        <Section title="Event details from the form">
          <dl className="grid grid-cols-2 gap-2 text-small">
            <dt className="text-muted">Type</dt>
            <dd>{detail.event.eventType}</dd>
            <dt className="text-muted">Dates</dt>
            <dd>
              {detail.event.dateFrom ?? "not given"}
              {detail.event.dateTo ? ` to ${detail.event.dateTo}` : ""}
            </dd>
            <dt className="text-muted">Guests</dt>
            <dd>{detail.event.guests ?? "not given"}</dd>
            <dt className="text-muted">Budget</dt>
            <dd>
              {detail.event.budgetPaise !== null
                ? formatInr(detail.event.budgetPaise)
                : "not given"}
            </dd>
            <dt className="text-muted">Needs</dt>
            <dd>{needs.length ? needs.join(", ") : "none ticked"}</dd>
          </dl>
          {detail.extracted.guest_hint ? (
            <p className="mt-2 text-xs text-muted">
              The guest chose “{detail.extracted.guest_hint}”. This is a hint only; routing comes
              from the message.
            </p>
          ) : null}
        </Section>
      ) : null}

      <Section title="Details">
        <FieldsForm
          enquiryId={q.id}
          extracted={detail.extracted}
          room={detail.room}
          canEdit={detail.can.work}
        />
      </Section>

      {detail.can.work ? (
        <Section title="Routing">
          <RerouteForm
            enquiryId={q.id}
            category={q.category}
            ownerId={q.ownerId}
            isComplaint={q.isComplaint}
            options={rerouteOptions(detail)}
          />
        </Section>
      ) : null}

      {draftPanel}
      {closePanel}

      <Section title="Timeline">
        <Timeline events={detail.timeline} staff={detail.staff} />
      </Section>
    </article>
  );
}
