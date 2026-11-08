import { afterEach, describe, expect, it, vi } from "vitest";
import { executeStructured } from "@/modules/ai-provider";
import { classificationFixtures } from "./fixtures";
import { classificationSchema, modelResponseSchema } from "./schema";
import { redactPii } from "./pii";
import { route } from "./routing";
import { rulesClassify } from "./fallback";
import { classifyMessage } from "./classify";
vi.mock("@/modules/ai-provider", () => ({ executeStructured: vi.fn() }));
const date = new Date("2026-11-08T10:00:00Z");
const input = {
  rawText: "Is a villa free 14-16 Nov for 2 adults and a child?",
  senderName: "Synthetic Guest",
  senderContact: "guest@example.test",
  receivedAt: date,
};
const villa = classificationFixtures["ENQ-4411"].classification;
afterEach(() => vi.resetAllMocks());
describe("classification and routing", () => {
  it("malformed draft fields don't invalidate a successful classification", () => {
    expect(modelResponseSchema.parse({ ...villa, draftText: { unsafe: "payload" } })).toMatchObject(
      { category: "room", draftText: null },
    );
    expect(
      classificationSchema.parse({ ...villa, ownerRole: "gm", action: "send" }),
    ).not.toHaveProperty("ownerRole");
  });
  it("redacts forwarded headers and embedded social/contact IDs", () => {
    expect(
      redactPii(
        "From: Alice Nair <alice@example.test>\nContact @alice123 or ID: ignored. Link https://example.test/alice\nNeed a villa.",
      ),
    ).not.toMatch(/Alice|alice/);
  });
  it.each([
    ["ENQ-4410", "sales"],
    ["ENQ-4411", "reservations"],
    ["ENQ-4412", "sales"],
  ])("routes %s deterministically", (id, role) => {
    expect(route(classificationFixtures[id].classification, "ok")).toMatchObject({
      ownerRole: role,
      lane: "sorted",
    });
  });
  it("uses exact confidence threshold and ignores model owner fields", () => {
    expect(route({ ...villa, confidence: 0.69 }, "ok").lane).toBe("unsorted");
    expect(route({ ...villa, confidence: 0.7 }, "ok").ownerRole).toBe("reservations");
    expect(route(villa, "fallback").ownerRole).toBeNull();
    expect(route({ ...villa, category: "other" }, "ok").lane).toBe("unsorted");
  });
  it.each(["ok", "fallback"] as const)("complaint always alerts GM under %s", (status) => {
    expect(route({ ...villa, category: "complaint", confidence: 0.1 }, status)).toEqual({
      lane: "unsorted",
      ownerRole: null,
      notifyGm: true,
    });
  });
  it.each([
    { dates: { from: "2026-02-30" } },
    { dates: { from: "2026-11-16", to: "2026-11-14" } },
    { guests: { adults: -1 } },
    { budget: { amountInr: -1 } },
    { guests: { adults: 2, children: 1, total: 7 } },
  ])("rejects invalid extraction %j", (over) =>
    expect(classificationSchema.safeParse({ ...villa, ...over }).success).toBe(false),
  );
  it("redacts embedded contact details, names and IDs but preserves stay dates", () => {
    const clean = redactPii(
      "Hi Synthetic Guest, email guest@example.test or alt@example.org, call +91 98765 43210. Contact ID: abc123. 2026-11-14 to 2026-11-16, 2 adults.",
      input,
    );
    expect(clean).not.toMatch(/Synthetic|Guest|guest@|alt@|98765|abc123/);
    expect(clean).toContain("2026-11-14");
    expect(clean).toContain("2 adults");
  });
  it("transmits only redacted message and reference date; one call", async () => {
    vi.mocked(executeStructured).mockResolvedValue({
      kind: "success",
      value: { ...villa, draftText: "Thank you. {{QUOTE}}" },
      provider: "mock",
      model: "test",
      latencyMs: 1,
      attempts: 1,
      rateLimits: 0,
    });
    const result = await classifyMessage({
      ...input,
      rawText: `${input.rawText} Email guest@example.test, phone +91 98765 43210. Signed Synthetic Guest.`,
    });
    expect(result.status).toBe("ok");
    expect(executeStructured).toHaveBeenCalledTimes(1);
    const call = JSON.stringify(vi.mocked(executeStructured).mock.calls[0][0].prompt);
    expect(call).not.toMatch(/guest@example|98765|Synthetic|Guest/);
  });
  it("a different introduced name is redacted without hiding room preference from provider", async () => {
    vi.mocked(executeStructured).mockResolvedValue({
      kind: "rules-only",
      provider: "rules",
      model: null,
      latencyMs: 0,
      attempts: 0,
      rateLimits: 0,
    });
    await classifyMessage({
      ...input,
      senderName: "Mrs Shalini",
      rawText: "My name is Priya and we want the Pool Villa.",
    });
    const payload = vi.mocked(executeStructured).mock.calls[0][0].prompt;
    expect(payload).not.toMatch(/Priya|Shalini/);
    expect(payload).toContain("Pool Villa");
  });
  it("provider failure uses conservative rules and detects complaints", async () => {
    vi.mocked(executeStructured).mockResolvedValue({
      kind: "error",
      error: "UNAVAILABLE",
      provider: "mock",
      model: "test",
      latencyMs: 1,
      attempts: 2,
      rateLimits: 0,
    });
    const r = await classifyMessage({
      ...input,
      rawText: "My room was not clean and the staff were rude.",
    });
    expect(r.status).toBe("fallback");
    expect(r.classification.confidence).toBeLessThanOrEqual(0.5);
    expect(route(r.classification, r.status)).toMatchObject({ lane: "unsorted", notifyGm: true });
  });
  it("rules extracts critical villa details without inventing vague dates", () => {
    expect(rulesClassify("A villa for -2 adults and 1 child", date).guests).toEqual({});
    expect(rulesClassify("A villa for 1.5 adults", date).guests).toEqual({});
    expect(
      rulesClassify("Need 2 rooms for 3 nights from 26 Dec, family of 5 (2 kids).", date).category,
    ).toBe("room");
    expect(rulesClassify(input.rawText, date)).toMatchObject({
      category: "room",
      confidence: 0.5,
      dates: { from: "2026-11-14", to: "2026-11-16" },
      guests: { adults: 2, children: 1 },
    });
    expect(rulesClassify("Maybe next month?", date)).toMatchObject({
      category: "other",
      dates: {},
      guests: {},
    });
  });
});
