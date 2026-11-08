import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { executeStructured, selectProvider } from "@/modules/ai-provider";
import { LOCAL_ATTEMPT_TIMEOUT_MS } from "@/modules/ai-provider/execute";
import { classifyMessage } from "@/modules/ai-router/classify";
import { modelResponseSchema } from "@/modules/ai-router/schema";
import { buildDraft } from "@/modules/ai-router/draft";
import { safeModelDraft } from "@/modules/ai-router/price-guard";
import { rulesClassify } from "@/modules/ai-router/fallback";
import { route } from "@/modules/ai-router/routing";
import { cases } from "../benchmarks/ollama/cases";
import {
  chooseCases,
  evaluateExtraction,
  percentile,
  placeholderCount,
} from "../benchmarks/ollama/metrics";

const classification = {
  category: "room" as const,
  confidence: 0.95,
  dates: { from: "2026-11-14", to: "2026-11-16" },
  guests: { adults: 2, children: 1, total: 3 },
  budget: {},
  language: "en",
  summary: "Villa enquiry",
};
const selection = () =>
  selectProvider({
    AI_PROVIDER: "local",
    AI_MODEL: "synthetic",
    LOCAL_AI_BASE_URL: "http://127.0.0.1:11434/v1",
  });
const envelope = (content: string) =>
  new Response(
    JSON.stringify({
      id: "mock",
      object: "chat.completion",
      created: 1,
      model: "synthetic",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { headers: { "content-type": "application/json" } },
  );
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("benchmark scoring", () => {
  it("rejects unknown/duplicate cases before running a misleading empty benchmark", () => {
    expect(chooseCases(["T01", "T05"]).map((c) => c.id)).toEqual(["T01", "T05"]);
    expect(() => chooseCases(["T01 T05"])).toThrow("Unknown or duplicate");
    expect(() => chooseCases(["T01", "T01"])).toThrow("Unknown or duplicate");
    expect(chooseCases([])).toHaveLength(30);
  });
  it("requires absent unknown fields and scores extraction separately", () => {
    const scores = evaluateExtraction(
      cases.find((c) => c.id === "T07")!,
      classification,
    );
    expect(scores.find((s) => s.path === "guests.adults")?.correct).toBe(false);
    expect(evaluateExtraction(cases[0], null).some((s) => s.correct)).toBe(false);
    expect(percentile([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(percentile([], 0.95)).toBeNull();
    expect(placeholderCount("{{QUOTE}} {{QUOTE}} ｛｛QUOTE｝｝")).toBe(2);
  });
});
describe("isolated production-adapter fault checks (mocked HTTP)", () => {
  it.each([
    ["invalid JSON", "not JSON"],
    ["schema mismatch", JSON.stringify({ category: "hotel" })],
    ["calendar date", JSON.stringify({ ...classification, dates: { from: "2026-02-30" } })],
    [
      "date order",
      JSON.stringify({ ...classification, dates: { from: "2026-11-16", to: "2026-11-14" } }),
    ],
    [
      "guest total",
      JSON.stringify({ ...classification, guests: { adults: 2, children: 1, total: 9 } }),
    ],
  ])("rejects %s through actual SDK/Zod path", async (_name, content) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => envelope(content)),
    );
    expect(
      await executeStructured(
        { schema: modelResponseSchema, system: "Synthetic", prompt: "Synthetic" },
        selection(),
      ),
    ).toMatchObject({ kind: "error", error: "INVALID_RESPONSE", attempts: 1 });
  });
  it("unavailable provider retries once and classification becomes unsorted fallback", async () => {
    vi.stubEnv("AI_PROVIDER", "local");
    vi.stubEnv("AI_MODEL", "synthetic");
    vi.stubEnv("LOCAL_AI_BASE_URL", "http://127.0.0.1:11434/v1");
    const fetch = vi.fn().mockRejectedValue(new TypeError("Synthetic unavailable"));
    vi.stubGlobal("fetch", fetch);
    const r = await classifyMessage({
      rawText: "Complaint: room was not clean",
      senderName: "Synthetic Visitor",
      senderContact: "visitor@benchmark.invalid",
      receivedAt: new Date("2026-11-08T06:30:00Z"),
    });
    expect(r).toMatchObject({
      status: "fallback",
      classification: { category: "complaint", confidence: 0.5 },
      response: { error: "UNAVAILABLE", attempts: 2 },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("actual extended local timers bound two stalled HTTP attempts", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => new Promise(() => {})),
    );
    const pending = executeStructured(
      { schema: z.object({ answer: z.string() }), system: "Synthetic", prompt: "Synthetic" },
      selection(),
    );
    await vi.advanceTimersByTimeAsync(LOCAL_ATTEMPT_TIMEOUT_MS * 2);
    expect(await pending).toMatchObject({ kind: "error", error: "TIMEOUT", attempts: 2 });
  });
  it.each([
    null,
    "Thanks for your enquiry.",
    "Thank you. {{QUOTE}} {{QUOTE}}",
    "Available at INR 999. {{QUOTE}}",
    "Booking confirmed. {{QUOTE}}",
  ])("bad prose falls back without changing valid extraction: %s", (draft) => {
    const value = modelResponseSchema.parse({ ...classification, draftText: draft });
    expect(buildDraft(value, value.draftText, null).usedTemplate).toBe(true);
    expect(value.category).toBe("room");
    expect(value.guests.total).toBe(3);
  });
  it("documents wrong perspective currently passing the guard", () => {
    const draft = "I would like to book a villa for my family. {{QUOTE}} Please let me know.";
    expect(safeModelDraft(draft, true)).toBe(true);
    expect(buildDraft(classification, draft, null).usedTemplate).toBe(false);
  });
  it("documents benign complaint acknowledgement rejected by refund keyword", () => {
    expect(
      safeModelDraft(
        "We are sorry to hear about your refund concern. Our team will review.",
        false,
      ),
    ).toBe(false);
  });
  it("documents explicit past stay passing validation", () => {
    expect(
      modelResponseSchema.safeParse({
        ...classification,
        dates: { from: "2026-10-14", to: "2026-10-16" },
      }).success,
    ).toBe(true);
  });
  it("documents non-English booking promise bypassing English prose guard", () => {
    expect(safeModelDraft("आपका कमरा पक्का हो गया है। {{QUOTE}} धन्यवाद।", true)).toBe(true);
  });
  it("documents keyword fallback reading an injected category as intent", () => {
    const c = rulesClassify(
      cases.find((c) => c.id === "T22")!.text,
      new Date("2026-11-08T06:30:00Z"),
    );
    expect(c.category).toBe("wedding");
    expect(route(c, "fallback").lane).toBe("unsorted");
  });
  it("documents Hindi-only complaint falling outside fallback keywords", () => {
    const c = rulesClassify(
      "शिकायत है: कमरा गंदा था और पैसे दो बार लिए।",
      new Date("2026-11-08T06:30:00Z"),
    );
    expect(c.category).toBe("other");
    expect(route(c, "fallback").notifyGm).toBe(false);
  });
});
