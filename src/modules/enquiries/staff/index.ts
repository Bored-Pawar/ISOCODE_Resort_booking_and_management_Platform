/** Staff inbox (Q4 to Q7): additive to the enquiries module, approved by the S2 inbox runbook. */
import { laneCounts, listInbox } from "./service";

export const inbox = { list: listInbox, counts: laneCounts };
export type { InboxPage, InboxRow, LaneCounts, Grounding } from "./service";
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
