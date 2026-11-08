import { afterEach, expect, it, vi } from "vitest";
import { executeStructured, selectProvider } from "@/modules/ai-provider";
import { modelResponseSchema } from "./schema";
import { classificationFixtures } from "./fixtures";
afterEach(() => vi.unstubAllGlobals());
it("the installed SDK serializes the full router schema and preserves classification when draft shape is bad", async () => {
  const value = {
    ...classificationFixtures["ENQ-4411"].classification,
    draftText: { wrong: "shape" },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "synthetic",
          object: "chat.completion",
          created: 1,
          model: "qwen3:4b",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: JSON.stringify(value) },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    ),
  );
  const r = await executeStructured(
    { schema: modelResponseSchema, prompt: "Synthetic", system: "Synthetic" },
    selectProvider({
      AI_PROVIDER: "local",
      AI_MODEL: "qwen3:4b",
      LOCAL_AI_BASE_URL: "http://localhost:11434/v1",
    }),
  );
  expect(r).toMatchObject({ kind: "success", value: { category: "room", draftText: null } });
});
