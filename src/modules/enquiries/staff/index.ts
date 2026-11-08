/** Staff inbox (Q4 to Q7): additive to the enquiries module, approved by the S2 inbox runbook. */
import { getDetail } from "./detail";
import { redraft } from "./drafting";
import { reroute, updateFields, fieldsInputSchema } from "./routing";
import { laneCounts, listInbox } from "./service";
import type { InboxActor } from "./rules";

/** Field edit, then (only when dates or guests changed) the quote and draft step again. */
async function saveFields(input: unknown, actor: InboxActor) {
  const res = await updateFields(input, actor);
  if (!res.ok || !res.requote) return { ...res, draft: "unchanged" as const };
  const { enquiryId } = fieldsInputSchema.parse(input);
  const draft = await redraft(enquiryId, false).catch((error) => {
    console.error("inbox re-quote failed", error);
    return "failed" as const;
  });
  return { ...res, draft };
}

export const inbox = {
  list: listInbox,
  counts: laneCounts,
  detail: getDetail,
  saveFields,
  reroute,
};
export type { InboxPage, InboxRow, LaneCounts, Grounding } from "./service";
export type { InboxDetail, Draft, TimelineEntry, StaffUser, Extracted } from "./detail";
export type { FieldsInput, RerouteInput } from "./routing";
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
