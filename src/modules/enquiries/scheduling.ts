import { after } from "next/server";

/** Register in request scope; no floating promises. Non-Next callers leave recoverable pending rows. */
export function scheduleProcessing(priorityId?: string) {
  try {
    after(async () => {
      try {
        const { recoverEnquiries } = await import("@/modules/ai-router");
        await recoverEnquiries(priorityId);
      } catch {
        /* Database outage: persisted rows are recovered on the next sweep. */
      }
    });
  } catch {
    /* No request scope (scripts/tests); never fail a successful persisted receipt. */
  }
}
