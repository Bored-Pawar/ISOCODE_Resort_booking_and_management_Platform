import { selectProvider } from "./factory";
import { executeWithDeadline } from "./transport";
import type { ProviderSelection, StructuredRequest } from "./types";
export { transportError } from "./transport";
export const ATTEMPT_TIMEOUT_MS = 10_000;
/** Application deadline is fixed for every provider; benchmark configuration is not read here. */
export function executeStructured<T>(
  request: StructuredRequest<T>,
  selection: ProviderSelection = selectProvider(),
) {
  return executeWithDeadline(request, selection, ATTEMPT_TIMEOUT_MS);
}
