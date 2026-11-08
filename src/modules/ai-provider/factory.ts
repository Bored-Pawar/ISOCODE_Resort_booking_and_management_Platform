import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGroq } from "@ai-sdk/groq";
import type { KeyedModel, ProviderSelection } from "./types";
export const GROQ_KEY_SLOTS = [1, 2, 3, 4] as const;
export function selectProvider(
  env: Record<string, string | undefined> = process.env,
): ProviderSelection {
  const provider = env.AI_PROVIDER || "google";
  if (provider === "rules") return { kind: "rules-only", provider };
  const modelId = env.AI_MODEL?.trim() || null;
  const missing = (): ProviderSelection => ({
    kind: "error",
    provider: ["google", "anthropic", "local", "groq"].includes(provider) ? provider : "unknown",
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
  if (provider === "groq") {
    // Order is 1 to 4; empty slots are skipped. Key values stay inside the SDK client.
    const keys: KeyedModel[] = GROQ_KEY_SLOTS.flatMap((n) => {
      const apiKey = env[`GROQ_API_KEY_${n}`]?.trim();
      return apiKey ? [{ slot: `groq:${n}`, model: createGroq({ apiKey })(modelId) }] : [];
    });
    if (keys.length) return { kind: "model", provider, modelId, model: keys[0].model, keys };
  }
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
