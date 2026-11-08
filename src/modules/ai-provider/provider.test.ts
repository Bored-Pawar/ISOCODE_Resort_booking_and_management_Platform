import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { readFileSync, readdirSync } from "node:fs";
import { generateText } from "ai";
import { selectProvider } from "./factory";
import { executeStructured } from "./execute";
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateText: vi.fn(),
}));
const request = { schema: z.object({ answer: z.string() }), system: "Safe", prompt: "Synthetic" };
const local = () =>
  selectProvider({
    AI_PROVIDER: "local",
    AI_MODEL: "qwen3:4b",
    LOCAL_AI_BASE_URL: "http://localhost:11434/v1",
  });
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
describe("provider transport", () => {
  it.each(["google", "anthropic", "local"])("selects %s", (name) => {
    expect(
      selectProvider({
        AI_PROVIDER: name,
        AI_MODEL: "test-model",
        GOOGLE_GENERATIVE_AI_API_KEY: "synthetic",
        ANTHROPIC_API_KEY: "synthetic",
        LOCAL_AI_BASE_URL: "http://localhost:11434/v1",
      }).kind,
    ).toBe("model");
  });
  it("rules makes zero model calls", async () => {
    expect((await executeStructured(request, selectProvider({ AI_PROVIDER: "rules" }))).kind).toBe(
      "rules-only",
    );
    expect(generateText).not.toHaveBeenCalled();
  });
  it("missing config fails without network", async () => {
    expect(
      await executeStructured(request, selectProvider({ AI_PROVIDER: "google", AI_MODEL: "test" })),
    ).toMatchObject({ kind: "error", error: "NOT_CONFIGURED", attempts: 0 });
    expect(generateText).not.toHaveBeenCalled();
  });
  it("one structured call, no SDK retries", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { answer: "yes" } } as never);
    expect(await executeStructured(request, local())).toMatchObject({
      kind: "success",
      value: { answer: "yes" },
      attempts: 1,
    });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateText).mock.calls[0][0]).toMatchObject({
      maxRetries: 0,
      output: expect.any(Object),
      abortSignal: expect.any(AbortSignal),
    });
  });
  it("invalid output/schema is not retried", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: { answer: 4 } } as never);
    expect(await executeStructured(request, local())).toMatchObject({
      error: "INVALID_RESPONSE",
      attempts: 1,
    });
    vi.mocked(generateText).mockRejectedValueOnce({
      name: "AI_UnsupportedFunctionalityError",
      message: "secret payload",
    });
    expect(await executeStructured(request, local())).toMatchObject({
      error: "INVALID_RESPONSE",
      attempts: 1,
    });
  });
  it("honours bounded Retry-After", async () => {
    vi.useFakeTimers();
    vi.mocked(generateText)
      .mockRejectedValueOnce({ statusCode: 429, responseHeaders: { "retry-after": "1" } })
      .mockResolvedValueOnce({ output: { answer: "yes" } } as never);
    const pending = executeStructured(request, local());
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ kind: "success", attempts: 2, rateLimits: 1 });
  });
  it("long Retry-After falls back; diagnostics omit payload", async () => {
    vi.mocked(generateText).mockRejectedValue({
      statusCode: 429,
      responseHeaders: { "retry-after": "60" },
      message: "secret contact api-key",
    });
    const result = await executeStructured(request, local());
    expect(result).toMatchObject({ error: "RATE_LIMIT", attempts: 1 });
    expect(JSON.stringify(result)).not.toMatch(/secret|contact|api-key/);
  });
  it("times out and aborts twice", async () => {
    vi.useFakeTimers();
    vi.mocked(generateText).mockImplementation(() => new Promise(() => {}));
    const pending = executeStructured(request, local());
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toMatchObject({ error: "TIMEOUT", attempts: 2, latencyMs: 20_000 });
    expect(vi.mocked(generateText).mock.calls.every(([args]) => args.abortSignal?.aborted)).toBe(
      true,
    );
  });
  it("invalid keys are not retried", async () => {
    vi.mocked(generateText).mockRejectedValue({ statusCode: 401 });
    expect(await executeStructured(request, local())).toMatchObject({
      error: "NOT_CONFIGURED",
      attempts: 1,
    });
  });
  it("has no domain/database imports", () => {
    for (const name of readdirSync(import.meta.dirname).filter(
      (s) => s.endsWith(".ts") && !s.endsWith(".test.ts"),
    ))
      expect(readFileSync(`${import.meta.dirname}/${name}`, "utf8")).not.toMatch(
        /from ["'].*(?:modules\/|db|pricing|enquiries|ai-router)/,
      );
  });
});
