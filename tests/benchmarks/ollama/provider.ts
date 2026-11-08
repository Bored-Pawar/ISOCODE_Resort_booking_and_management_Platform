import { selectProvider, type StructuredRequest } from "../../../src/modules/ai-provider";
import type { ProviderSelection } from "../../../src/modules/ai-provider/types";
import { executeWithDeadline } from "../../../src/modules/ai-provider/transport";
/** Explicit standalone CLI policy; never exported by the application provider entry point. */
export const BENCHMARK_ATTEMPT_TIMEOUT_MS = 30 * 60 * 1000;
export function executeStructured<T>(
  request: StructuredRequest<T>,
  selection: ProviderSelection = selectProvider(),
) {
  return executeWithDeadline(request, selection, BENCHMARK_ATTEMPT_TIMEOUT_MS);
}
