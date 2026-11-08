import type { LanguageModel } from "ai";
import type { z } from "zod";
export type ProviderName = "google" | "anthropic" | "local" | "rules";
export type ProviderError =
  "TIMEOUT" | "RATE_LIMIT" | "INVALID_RESPONSE" | "NOT_CONFIGURED" | "UNAVAILABLE";
export type ProviderMeta = {
  provider: string;
  model: string | null;
  latencyMs: number;
  attempts: number;
  rateLimits: number;
};
export type ProviderResult<T> =
  | ({ kind: "success"; value: T } & ProviderMeta)
  | ({ kind: "error"; error: ProviderError } & ProviderMeta)
  | ({ kind: "rules-only" } & ProviderMeta);
export type StructuredRequest<T> = { schema: z.ZodType<T>; system: string; prompt: string };
export type ProviderSelection =
  | { kind: "model"; provider: ProviderName; modelId: string; model: LanguageModel }
  | { kind: "rules-only"; provider: "rules" }
  | { kind: "error"; provider: string; modelId: string | null };
