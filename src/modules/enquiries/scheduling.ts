import { after } from "next/server";
import { sweepCandidates, SWEEP_LIMIT } from "./internal";

/** Register in request scope; no floating promises. Non-Next callers leave recoverable pending rows. */
export function scheduleProcessing(priorityId?: string) {
  try {
    after(async () => {
      try {
        const { aiRouter } = await import("@/modules/ai-router");
        const queued = await sweepCandidates();
        const ids = [...new Set([...(priorityId ? [priorityId] : []), ...queued])].slice(
          0,
          SWEEP_LIMIT,
        );
        await Promise.allSettled(ids.map((enquiryId) => aiRouter.process({ enquiryId })));
      } catch {
        /* Database outage: persisted rows are recovered on the next sweep. */
      }
    });
  } catch {
    /* No request scope (scripts/tests); never fail a successful persisted receipt. */
  }
}
