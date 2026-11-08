import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ProviderSelection } from "./types";
export function selectProvider(
  env: Record<string, string | undefined> = process.env,
): ProviderSelection {
  const provider = env.AI_PROVIDER || "google";
  if (provider === "rules") return { kind: "rules-only", provider };
  const modelId = env.AI_MODEL?.trim() || null;
  const missing = (): ProviderSelection => ({
    kind: "error",
    provider: ["google", "anthropic", "local"].includes(provider) ? provider : "unknown",
    modelId,
  });
  if (!modelId) return missing();
  if (provider === "google" && env.GOOGLE_GENERATIVE_AI_API_KEY)
    return {
      kind: "model",
      provider,
      modelId,
      model: createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })(modelId),
    };
  if (provider === "anthropic" && env.ANTHROPIC_API_KEY)
    return {
      kind: "model",
      provider,
      modelId,
      model: createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(modelId),
    };
  if (provider === "local" && env.LOCAL_AI_BASE_URL) {
    try {
      const url = new URL(env.LOCAL_AI_BASE_URL);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        return missing();
      return {
        kind: "model",
        provider,
        modelId,
        model: createOpenAICompatible({
          name: "local",
          baseURL: url.toString().replace(/\/$/, ""),
          supportsStructuredOutputs: true,
        })(modelId),
      };
    } catch {
      return missing();
    }
  }
  return missing();
}
