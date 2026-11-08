import { generateText, Output } from "ai";
import { selectProvider } from "./factory";
import type { ProviderError, ProviderResult, ProviderSelection, StructuredRequest } from "./types";
export const ATTEMPT_TIMEOUT_MS = 10_000;
// Local laptop inference includes cold loading and CPU offload; hosted calls keep a short budget.
export const LOCAL_ATTEMPT_TIMEOUT_MS = 30 * 60 * 1000;
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
/** One SDK path, no tools/business logic, at most one transient retry. */
export async function executeStructured<T>(
  request: StructuredRequest<T>,
  selection: ProviderSelection = selectProvider(),
): Promise<ProviderResult<T>> {
  const started = Date.now();
  let attempts = 0;
  let rateLimits = 0;
  const meta = () => ({
    provider: selection.provider,
    model: selection.kind === "rules-only" ? null : selection.modelId,
    latencyMs: Date.now() - started,
    attempts,
    rateLimits,
  });
  if (selection.kind === "rules-only") return { kind: "rules-only", ...meta() };
  if (selection.kind === "error") return { kind: "error", error: "NOT_CONFIGURED", ...meta() };
  const attemptTimeoutMs =
    selection.provider === "local" ? LOCAL_ATTEMPT_TIMEOUT_MS : ATTEMPT_TIMEOUT_MS;
  for (let i = 0; i < 2; i++) {
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
      const result = await Promise.race([
        generateText({
          model: selection.model,
          system: request.system,
          prompt: request.prompt,
          output: Output.object({ schema: request.schema }),
          maxRetries: 0,
          maxOutputTokens: 1800,
          abortSignal: controller.signal,
          telemetry: { isEnabled: false },
        }),
        expired,
      ]);
      const checked = request.schema.safeParse(result.output);
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
}
