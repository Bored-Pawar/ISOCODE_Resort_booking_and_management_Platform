import { generateText, Output } from "ai";
import type { ProviderError, ProviderResult, ProviderSelection, StructuredRequest } from "./types";
/** Inspect transport metadata only; SDK messages and bodies may contain secrets/PII. */
export function transportError(error: unknown): {
  code: ProviderError;
  retry: boolean;
  delayMs: number;
} {
  const e = error as {
    name?: string;
    statusCode?: number;
    responseHeaders?: Record<string, string>;
  } | null;
  const status = e?.statusCode;
  if (e?.name === "AbortError" || e?.name === "TimeoutError")
    return { code: "TIMEOUT", retry: true, delayMs: 0 };
  if (status === 401 || status === 403) return { code: "NOT_CONFIGURED", retry: false, delayMs: 0 };
  if (status === 429) {
    const header = e?.responseHeaders?.["retry-after"];
    const seconds = header ? Number(header) : NaN;
    const delayMs = header
      ? Number.isFinite(seconds)
        ? seconds * 1000
        : Date.parse(header) - Date.now()
      : 250;
    return {
      code: "RATE_LIMIT",
      retry: Number.isFinite(delayMs) && delayMs <= 1000,
      delayMs: Math.max(0, delayMs),
    };
  }
  if (e?.name?.match(/(NoObjectGenerated|NoOutputGenerated|TypeValidation|JSONParse|Unsupported)/))
    return { code: "INVALID_RESPONSE", retry: false, delayMs: 0 };
  if (status && status < 500 && status !== 408)
    return { code: "INVALID_RESPONSE", retry: false, delayMs: 0 };
  return { code: "UNAVAILABLE", retry: true, delayMs: 250 };
}
/** Default key cool-down when a key is rate limited or rejected without Retry-After. */
export const KEY_COOLDOWN_MS = 60_000;
/** Per-instance, in-memory cool-downs by opaque slot id. Never persisted or logged. */
const coolingUntil = new Map<string, number>();
/** Test helper: forget all key cool-downs. */
export function resetKeyCooldowns() {
  coolingUntil.clear();
}
function cooldownMs(error: unknown) {
  const header = (error as { responseHeaders?: Record<string, string> } | null)?.responseHeaders?.[
    "retry-after"
  ];
  if (!header) return KEY_COOLDOWN_MS;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? ms : KEY_COOLDOWN_MS;
}
function availableModels(selection: Extract<ProviderSelection, { kind: "model" }>) {
  if (!selection.keys) return [{ slot: null, model: selection.model }];
  const now = Date.now();
  return selection.keys.filter((key) => (coolingUntil.get(key.slot) ?? 0) <= now);
}
/**
 * One SDK path, no tools/business logic, at most one transient retry. With a key pool, a 429 or
 * 401/403 cools that key and the next key is tried at once inside the same attempt deadline.
 */
export async function executeWithDeadline<T>(
  request: StructuredRequest<T>,
  selection: ProviderSelection,
  attemptTimeoutMs: number,
): Promise<ProviderResult<T>> {
  const started = Date.now();
  let attempts = 0;
  let rateLimits = 0;
  let rotations = 0;
  const meta = () => ({
    provider: selection.provider,
    model: selection.kind === "rules-only" ? null : selection.modelId,
    latencyMs: Date.now() - started,
    attempts,
    rateLimits,
  });
  if (selection.kind === "rules-only") return { kind: "rules-only", ...meta() };
  if (selection.kind === "error") return { kind: "error", error: "NOT_CONFIGURED", ...meta() };
  let keyError: ProviderError = "RATE_LIMIT";
  try {
    for (let i = 0; i < 2; i++) {
      const candidates = availableModels(selection);
      // Every key is cooling: no network call, rules fallback.
      if (!candidates.length) return { kind: "error", error: keyError, ...meta() };
      attempts++;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const expired = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new DOMException("Timed out", "TimeoutError"));
          }, attemptTimeoutMs);
        });
        let output: unknown;
        // Bounded by the pool size (at most four keys) and by this attempt's single deadline.
        for (let k = 0; k < candidates.length; k++) {
          const candidate = candidates[k];
          try {
            const result = await Promise.race([
              generateText({
                model: candidate.model,
                system: request.system,
                prompt: request.prompt,
                output: Output.object({ schema: request.schema }),
                maxRetries: 0,
                maxOutputTokens: 1800,
                // Groq's strict json_schema mode demands every property be required, which our
                // optional fields (budget.amountInr, dates.text...) are not: it answers 400.
                // Non-strict json_schema still guides the model; Zod below stays the gate.
                ...(selection.provider === "groq"
                  ? { providerOptions: { groq: { strictJsonSchema: false } } }
                  : {}),
                abortSignal: controller.signal,
                telemetry: { isEnabled: false },
              }),
              expired,
            ]);
            output = result.output;
            break;
          } catch (error) {
            if (!candidate.slot || controller.signal.aborted) throw error;
            const safe = transportError(error);
            if (safe.code !== "RATE_LIMIT" && safe.code !== "NOT_CONFIGURED") throw error;
            if (safe.code === "RATE_LIMIT") rateLimits++;
            coolingUntil.set(candidate.slot, Date.now() + cooldownMs(error));
            keyError = safe.code;
            if (k === candidates.length - 1) return { kind: "error", error: safe.code, ...meta() };
            rotations++;
          }
        }
        const checked = request.schema.safeParse(output);
        if (!checked.success) return { kind: "error", error: "INVALID_RESPONSE", ...meta() };
        return { kind: "success", value: checked.data, ...meta() };
      } catch (error) {
        const safe = transportError(controller.signal.aborted ? { name: "TimeoutError" } : error);
        if (safe.code === "RATE_LIMIT") rateLimits++;
        if (i === 1 || !safe.retry) return { kind: "error", error: safe.code, ...meta() };
        if (timer) clearTimeout(timer);
        if (safe.delayMs) await new Promise((resolve) => setTimeout(resolve, safe.delayMs));
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    return { kind: "error", error: "UNAVAILABLE", ...meta() };
  } finally {
    // Count only: no key value, slot or index is ever logged.
    if (rotations) console.warn("groq key rotated", { count: rotations });
  }
}
