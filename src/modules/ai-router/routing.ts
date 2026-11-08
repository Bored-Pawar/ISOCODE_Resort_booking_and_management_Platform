import type { Classification } from "./schema";
import { hasComplaint } from "./complaints";
export function route(
  classification: Classification,
  status: "ok" | "fallback",
  rawText = "",
  modelSignal = false,
) {
  const notifyGm = hasComplaint(rawText, classification.category, modelSignal);
  const ownerRole =
    status !== "ok" || classification.confidence < 0.7 || classification.category === "other"
      ? null
      : classification.category === "room"
        ? ("reservations" as const)
        : classification.category === "complaint"
          ? ("gm" as const)
          : ("sales" as const);
  return { lane: ownerRole ? ("sorted" as const) : ("unsorted" as const), ownerRole, notifyGm };
}
