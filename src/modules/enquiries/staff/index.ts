/** Staff inbox (Q4 to Q7): additive to the enquiries module, approved by the S2 inbox runbook. */
import { getDetail } from "./detail";
import { rebuild } from "./drafting";
import { reroute, updateFields, fieldsInputSchema } from "./routing";
import { laneCounts, listInbox } from "./service";
import { bell, markAllRead, markRead } from "./notifications";
import { requestAttention, resolveAttention } from "./attention";
import {
  approveAndSend,
  closeEnquiry,
  listSentReplies,
  rebuildQuote,
  regenerateDraft,
  saveDraft,
} from "./send";
import type { InboxActor } from "./rules";

/**
 * Field edit, then (when dates, guests or room changed) the quote and draft step again. The edit
 * itself already marked the quote `rebuilding`; a failed rebuild marks it `failed`. Either way the
 * old draft cannot be approved until a rebuild from the current facts lands.
 */
async function saveFields(input: unknown, actor: InboxActor) {
  const res = await updateFields(input, actor);
  if (!res.ok) return res;
  const { gen, ...saved } = res;
  if (!saved.requote || !gen) return { ...saved, draft: "unchanged" as const };
  const { enquiryId } = fieldsInputSchema.parse(input);
  return { ...saved, draft: await rebuild(enquiryId, gen, false) };
}

export const inbox = {
  list: listInbox,
  counts: laneCounts,
  detail: getDetail,
  saveFields,
  reroute,
  saveDraft,
  regenerateDraft,
  rebuildQuote,
  approveAndSend,
  close: closeEnquiry,
  sentReplies: listSentReplies,
  bell,
  markRead,
  markAllRead,
  requestAttention,
  resolveAttention,
};
export type { InboxPage, InboxRow, LaneCounts, Grounding } from "./service";
export type { InboxDetail, Draft, TimelineEntry, StaffUser, Extracted, RoomView } from "./detail";
export type { FieldsInput, RerouteInput } from "./routing";
export type { QuoteFacts, QuoteState, RoomFact } from "./facts";
export type { SentReply } from "./send";
export type { Bell, BellItem } from "./notifications";
export {
  LANES,
  LANE_LABELS,
  LANE_EMPTY,
  lanesFor,
  badgeLanesFor,
  canView,
  canWork,
  type InboxActor,
  type Lane,
  type ListInput,
} from "./rules";
