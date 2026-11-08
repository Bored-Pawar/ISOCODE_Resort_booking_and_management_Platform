import { z } from "zod";
import { claimSweep, SWEEP_LIMIT } from "@/modules/enquiries/internal";
import { processEnquiry } from "./processing";
/** Invoked by authenticated cron or persisted intake/inbox scheduling; no network in claim TX. */
export async function recoverEnquiries(priorityId?: string) {
  const id = z.string().min(1).max(100).optional().parse(priorityId);
  const claims = (await claimSweep(id)).slice(0, SWEEP_LIMIT);
  const settled = await Promise.allSettled(
    claims.map((claim) => processEnquiry({ enquiryId: claim.row.id }, claim)),
  );
  return {
    claimed: claims.length,
    completed: settled.filter((r) => r.status === "fulfilled" && r.value.ok).length,
  };
}
