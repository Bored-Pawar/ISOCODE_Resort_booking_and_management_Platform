import type { Classification } from "./schema";
export function route(classification: Classification, status: "ok" | "fallback") {
  const notifyGm = classification.category === "complaint";
  const ownerRole =
    status !== "ok" || classification.confidence < 0.7 || classification.category === "other"
      ? null
      : classification.category === "room"
        ? ("reservations" as const)
        : notifyGm
          ? ("gm" as const)
          : ("sales" as const);
  return { lane: ownerRole ? ("sorted" as const) : ("unsorted" as const), ownerRole, notifyGm };
}
