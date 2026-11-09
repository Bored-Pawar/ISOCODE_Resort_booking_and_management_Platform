import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { executeStructured, ATTEMPT_TIMEOUT_MS } from "./execute";
import { selectProvider } from "./factory";
import { resetKeyCooldowns, KEY_COOLDOWN_MS } from "./transport";
import { classifyMessage } from "../ai-router/classify";

// Synthetic key values; the assertions below prove none of them leak.
const KEYS = [
  "gsk_synthetic_alpha",
  "gsk_synthetic_bravo",
  "gsk_synthetic_charlie",
  "gsk_synthetic_delta",
];
const env = (keys: (string | undefined)[], extra: Record<string, string> = {}) => ({
  AI_PROVIDER: "groq",
  AI_MODEL: "openai/gpt-oss-20b",
  ...Object.fromEntries(keys.map((key, i) => [`GROQ_API_KEY_${i + 1}`, key])),
  ...extra,
});
const request = {
  schema: z.object({ answer: z.string() }),
  system: "Synthetic",
  prompt: "Synthetic",
};

const ok = (content: unknown) =>
  new Response(
    JSON.stringify({
      id: "synthetic",
      object: "chat.completion",
      created: 1,
      model: "openai/gpt-oss-20b",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: JSON.stringify(content) },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    { headers: { "content-type": "application/json" } },
  );
const fail = (status: number, headers: Record<string, string> = {}) =>
  new Response(
    JSON.stringify({ error: { message: `synthetic failure for ${KEYS.join(",")}`, type: "x" } }),
    { status, headers: { "content-type": "application/json", ...headers } },
  );

/** Responds per bearer key; records which key each request carried. */
function stubGroq(byKey: Record<string, () => Response | Promise<Response>>) {
  const used: string[] = [];
  const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
    const auth = new Headers(init.headers).get("authorization") ?? "";
    const key = auth.replace(/^Bearer /, "");
    used.push(key);
    return (byKey[key] ?? (() => fail(500)))();
  });
  vi.stubGlobal("fetch", fetch);
  return used;
}

let logs: unknown[][];
beforeEach(() => {
  resetKeyCooldowns();
  logs = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const)
    vi.spyOn(console, level).mockImplementation((...args) => void logs.push(args));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const noKeyLeak = (...values: unknown[]) => {
  const text = JSON.stringify([values, logs]);
  for (const key of KEYS) expect(text).not.toContain(key);
  expect(text).not.toMatch(/GROQ_API_KEY|groq:\d|slot/);
};

it("selects groq with the configured model and ordered keys, skipping empty slots", () => {
  const selection = selectProvider(env(["", KEYS[1], "  ", KEYS[3]]));
  expect(selection).toMatchObject({
    kind: "model",
    provider: "groq",
    modelId: "openai/gpt-oss-20b",
  });
  expect(selection.kind === "model" && selection.keys?.map((k) => k.slot)).toEqual([
    "groq:2",
    "groq:4",
  ]);
});

it("no keys or no model is NOT_CONFIGURED without network", async () => {
  const used = stubGroq({});
  for (const selection of [
    selectProvider(env(["", "", "", ""])),
    selectProvider({ AI_PROVIDER: "groq", GROQ_API_KEY_1: KEYS[0] }),
  ]) {
    expect(selection.kind).toBe("error");
    expect(await executeStructured(request, selection)).toMatchObject({
      kind: "error",
      error: "NOT_CONFIGURED",
      provider: "groq",
      attempts: 0,
    });
  }
  expect(used).toEqual([]);
});

it("key 1 returns 429 -> key 2 used at once, in one attempt", async () => {
  const used = stubGroq({ [KEYS[0]]: () => fail(429), [KEYS[1]]: () => ok({ answer: "yes" }) });
  const result = await executeStructured(request, selectProvider(env(KEYS)));
  expect(result).toMatchObject({ kind: "success", value: { answer: "yes" }, attempts: 1 });
  expect(used).toEqual([KEYS[0], KEYS[1]]);
  expect(logs).toEqual([["groq key rotated", { count: 1 }]]);
  noKeyLeak(result);
});

it("a cooling key is skipped on the next call until its Retry-After passes", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const used = stubGroq({
    [KEYS[0]]: () => fail(429, { "retry-after": "30" }),
    [KEYS[1]]: () => ok({ answer: "yes" }),
  });
  const selection = () => selectProvider(env(KEYS));
  await executeStructured(request, selection());
  await executeStructured(request, selection());
  expect(used).toEqual([KEYS[0], KEYS[1], KEYS[1]]);
  vi.advanceTimersByTime(30_001);
  await executeStructured(request, selection());
  expect(used.at(-2)).toBe(KEYS[0]);
});

it("401/403 rotates too and cools for the default 60 s", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const used = stubGroq({
    [KEYS[0]]: () => fail(401),
    [KEYS[1]]: () => fail(403),
    [KEYS[2]]: () => ok({ answer: "yes" }),
  });
  expect(await executeStructured(request, selectProvider(env(KEYS)))).toMatchObject({
    kind: "success",
  });
  expect(used).toEqual([KEYS[0], KEYS[1], KEYS[2]]);
  vi.advanceTimersByTime(KEY_COOLDOWN_MS - 1);
  await executeStructured(request, selectProvider(env(KEYS)));
  expect(used.at(-1)).toBe(KEYS[2]);
  vi.advanceTimersByTime(2);
  await executeStructured(request, selectProvider(env(KEYS)));
  expect(used.at(-3)).toBe(KEYS[0]);
});

it("all four keys failing -> error without retry; later calls skip network while cooling", async () => {
  const used = stubGroq({
    [KEYS[0]]: () => fail(429),
    [KEYS[1]]: () => fail(401),
    [KEYS[2]]: () => fail(403),
    [KEYS[3]]: () => fail(429),
  });
  const first = await executeStructured(request, selectProvider(env(KEYS)));
  expect(first).toMatchObject({ kind: "error", error: "RATE_LIMIT", attempts: 1, rateLimits: 2 });
  expect(used).toEqual(KEYS);
  expect(logs).toEqual([["groq key rotated", { count: 3 }]]);
  const second = await executeStructured(request, selectProvider(env(KEYS)));
  expect(second).toMatchObject({ kind: "error", error: "RATE_LIMIT", attempts: 0 });
  expect(used).toHaveLength(4);
  noKeyLeak(first, second);
});

it("all keys failing falls back to rules, unsorted, with only a sanitized error code", async () => {
  stubGroq(Object.fromEntries(KEYS.map((key) => [key, () => fail(429)])));
  vi.stubEnv("AI_PROVIDER", "groq");
  vi.stubEnv("AI_MODEL", "openai/gpt-oss-20b");
  KEYS.forEach((key, i) => vi.stubEnv(`GROQ_API_KEY_${i + 1}`, key));
  const outcome = await classifyMessage({
    rawText: "Hi, do you have rooms for 2 adults next weekend?",
    senderName: "Synthetic Guest",
    senderContact: "guest@example.test",
    receivedAt: new Date("2026-11-09T06:00:00Z"),
  });
  vi.unstubAllEnvs();
  expect(outcome.status).toBe("fallback");
  expect(outcome.classification.confidence).toBeLessThanOrEqual(0.5);
  expect(outcome.response).toMatchObject({ kind: "error", error: "RATE_LIMIT", provider: "groq" });
  noKeyLeak(outcome);
});

it("requests non-strict json_schema (Groq strict mode rejects optional fields with a 400)", async () => {
  const bodies: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return ok({ answer: "yes" });
    }),
  );
  await executeStructured(request, selectProvider(env(KEYS)));
  expect(bodies[0]).toMatchObject({
    response_format: { type: "json_schema", json_schema: { strict: false } },
  });
});

it("5xx keeps the one retry on the same pool, no rotation", async () => {
  let calls = 0;
  const used = stubGroq({
    [KEYS[0]]: () => (++calls === 1 ? fail(503) : ok({ answer: "yes" })),
  });
  expect(await executeStructured(request, selectProvider(env(KEYS)))).toMatchObject({
    kind: "success",
    attempts: 2,
  });
  expect(used).toEqual([KEYS[0], KEYS[0]]);
  expect(logs).toEqual([]);
});

it("key switches share the ten-second attempt deadline; total stays at two attempts", async () => {
  vi.useFakeTimers();
  const hang = () => new Promise<Response>(() => {});
  const used = stubGroq({
    [KEYS[0]]: () => fail(429),
    [KEYS[1]]: hang,
    [KEYS[2]]: hang,
    [KEYS[3]]: hang,
  });
  const pending = executeStructured(request, selectProvider(env(KEYS)));
  await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS * 2);
  expect(await pending).toMatchObject({
    error: "TIMEOUT",
    attempts: 2,
    latencyMs: ATTEMPT_TIMEOUT_MS * 2,
  });
  // Attempt 1: key 1 (429) then key 2 (timeout). Attempt 2: key 2 again (key 1 cooling).
  expect(used).toEqual([KEYS[0], KEYS[1], KEYS[1]]);
});
