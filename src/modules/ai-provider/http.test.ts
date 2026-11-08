import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { executeStructured } from "./execute";
import { selectProvider } from "./factory";
afterEach(() => vi.unstubAllGlobals());
it("runs the real structured SDK path against a mocked Ollama-compatible HTTP response", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "synthetic",
          object: "chat.completion",
          created: 1,
          model: "qwen3:4b",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: JSON.stringify({ answer: "safe" }) },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
  vi.stubGlobal("fetch", fetch);
  const selection = selectProvider({
    AI_PROVIDER: "local",
    AI_MODEL: "qwen3:4b",
    LOCAL_AI_BASE_URL: "http://localhost:11434/v1",
  });
  const result = await executeStructured(
    { schema: z.object({ answer: z.string() }), system: "Synthetic only", prompt: "Respond" },
    selection,
  );
  expect(result).toMatchObject({ kind: "success", value: { answer: "safe" }, attempts: 1 });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(String(url)).toBe("http://localhost:11434/v1/chat/completions");
  expect(JSON.parse(options.body)).toMatchObject({
    model: "qwen3:4b",
    response_format: { type: "json_schema" },
  });
});
