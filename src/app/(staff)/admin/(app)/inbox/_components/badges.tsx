import {
  AlertTriangle,
  Bot,
  CircleAlert,
  Clock,
  Mail,
  MessageCircle,
  ShieldAlert,
  Globe,
  CalendarHeart,
} from "lucide-react";
import { Badge } from "@/components/ui";
import type { InboxRow } from "@/modules/enquiries";
import { EVIDENCE_LABEL, LOW_CONFIDENCE, type Evidence } from "@/modules/enquiries/staff/rules";

export const CATEGORY_LABEL = {
  room: "Room",
  wedding: "Wedding",
  offsite: "Offsite",
  complaint: "Complaint",
  other: "Other",
} as const;
export const CHANNEL_LABEL = {
  web: "Web",
  email: "Email",
  whatsapp: "WhatsApp",
  event_form: "Event form",
} as const;
export const STATUS_LABEL = {
  new: "New",
  assigned: "Assigned",
  replied: "Replied",
  closed: "Closed",
} as const;
const CHANNEL_ICON = {
  web: <Globe strokeWidth={1.5} />,
  email: <Mail strokeWidth={1.5} />,
  whatsapp: <MessageCircle strokeWidth={1.5} />,
  event_form: <CalendarHeart strokeWidth={1.5} />,
} as const;
const AI_LABEL = {
  pending: "AI pending",
  processing: "AI working",
  ok: "AI ok",
  fallback: "Rules fallback",
  failed: "AI failed",
} as const;

export function CategoryBadge({ category }: { category: InboxRow["category"] }) {
  return <Badge tone="accent">{category ? CATEGORY_LABEL[category] : "Unsorted"}</Badge>;
}
export function ChannelBadge({ channel }: { channel: InboxRow["channel"] }) {
  return <Badge icon={CHANNEL_ICON[channel]}>{CHANNEL_LABEL[channel]}</Badge>;
}
export function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) return null;
  const low = confidence < LOW_CONFIDENCE;
  return (
    <Badge
      tone={low ? "warning" : "neutral"}
      icon={low ? <AlertTriangle strokeWidth={1.5} /> : undefined}
      className="tabular-nums"
    >
      {low ? "Low " : ""}
      {Math.round(confidence * 100)}%
    </Badge>
  );
}
export function ComplaintBadge() {
  return (
    <Badge tone="danger" icon={<ShieldAlert strokeWidth={1.5} />}>
      Complaint
    </Badge>
  );
}
export function AiBadge({ status }: { status: InboxRow["aiStatus"] }) {
  const tone = status === "failed" ? "danger" : status === "ok" ? "neutral" : "warning";
  return (
    <Badge tone={tone} icon={<Bot strokeWidth={1.5} />}>
      {AI_LABEL[status]}
    </Badge>
  );
}
export function EvidenceBadge({ label, value }: { label: string; value: Evidence | undefined }) {
  const v: Evidence = value ?? "missing";
  const tone = v === "ok" ? "success" : v === "staff" ? "accent" : "warning";
  return (
    <Badge tone={tone} icon={v === "ok" ? undefined : <CircleAlert strokeWidth={1.5} />}>
      {label}: {EVIDENCE_LABEL[v]}
    </Badge>
  );
}
export function WaitingBadge({ text, replied }: { text: string; replied: boolean }) {
  return (
    <Badge icon={<Clock strokeWidth={1.5} />} className="tabular-nums">
      {replied ? `Replied after ${text}` : `Waiting ${text}`}
    </Badge>
  );
}
