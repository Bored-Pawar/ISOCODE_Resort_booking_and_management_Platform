import {
  claimEnquiry,
  settleEnquiry,
  ownerRoleFor,
  failClaim,
  type Claim,
} from "@/modules/enquiries/internal";
import type { ProcessInput, ProcessResult } from "./index";
import { processInputSchema } from "./index";
import { classificationSchema } from "./schema";
import { classifyMessage } from "./classify";
import { route } from "./routing";
import { selectQuote } from "./quote-selection";
import { buildDraft } from "./draft";
import { PROMPT_VERSION } from "./prompts";
import { groundExtraction } from "./grounding";
import { todayIST } from "@/lib/dates";

export async function processEnquiry(
  input: ProcessInput,
  suppliedClaim?: Claim,
): Promise<ProcessResult> {
  const parsed = processInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  let activeClaim: Claim | undefined;
  try {
    const claimed = suppliedClaim
      ? { kind: "claimed" as const, claim: suppliedClaim }
      : await claimEnquiry(parsed.data.enquiryId);
    if (claimed.kind === "missing") return { ok: false, code: "NOT_FOUND" };
    if (claimed.kind === "busy") return { ok: false, code: "FAILED" };
    if (claimed.kind === "existing") {
      const stored = (claimed.row.extracted ?? {}) as Record<string, unknown>;
      const c = classificationSchema.safeParse({
        dates: {},
        guests: {},
        budget: {},
        language: "und",
        ...stored,
        category: claimed.row.category,
        confidence: Number(claimed.row.confidence),
      });
      if (!c.success) return { ok: false, code: "FAILED" };
      return {
        ok: true,
        status: claimed.row.aiStatus as "ok" | "fallback",
        classification: c.data,
        lane: claimed.row.lane as "sorted" | "unsorted",
        ownerRole: await ownerRoleFor(claimed.row),
        notifyGm: claimed.row.isComplaint,
      };
    }
    activeClaim = claimed.claim;
    const outcome = await classifyMessage(claimed.claim.row);
    const routing = route(
      outcome.classification,
      outcome.status,
      claimed.claim.row.rawText,
      outcome.complaintSignal,
    );
    const today = todayIST();
    const evidence = groundExtraction(claimed.claim.row.rawText, outcome.classification, today);
    // Quoting is optional: DB/rate/availability failure must not discard good classification.
    const quote = evidence.eligible
      ? await selectQuote(outcome.classification, claimed.claim.row.rawText, today).catch(
          () => null,
        )
      : null;
    const draft = buildDraft(
      outcome.classification,
      outcome.draftText,
      quote,
      evidence,
      claimed.claim.row.rawText,
    );
    const saved = await settleEnquiry(claimed.claim, {
      status: outcome.status,
      category: outcome.classification.category,
      confidence: outcome.classification.confidence,
      extracted: {
        ...outcome.classification,
        grounding: evidence.grounding,
        ai: {
          provider: outcome.response.provider,
          model: outcome.response.model,
          promptVersion: PROMPT_VERSION,
          latencyMs: outcome.response.latencyMs,
          draftTemplate: draft.usedTemplate,
        },
      },
      ownerRole: routing.ownerRole,
      notifyGm: routing.notifyGm,
      lastError: outcome.response.kind === "error" ? outcome.response.error : null,
      draft: {
        body: draft.body,
        quote: draft.quote,
        provider: outcome.response.provider,
        model: outcome.response.model,
        promptVersion: PROMPT_VERSION,
      },
    });
    if (!saved) return { ok: false, code: "FAILED" };
    return {
      ok: true,
      status: outcome.status,
      classification: outcome.classification,
      lane: saved.lane as "sorted" | "unsorted",
      ownerRole: saved.ownerId ? routing.ownerRole : null,
      notifyGm: routing.notifyGm,
    };
  } catch {
    if (activeClaim) await failClaim(activeClaim).catch(() => {});
    // Never echo an SDK/SQL error: it can contain raw messages and bound contact data.
    // The raw row/processing generation remains recoverable after a failed transaction.
    return { ok: false, code: "FAILED" };
  }
}
