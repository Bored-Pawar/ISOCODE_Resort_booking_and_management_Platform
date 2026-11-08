import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const svc = vi.hoisted(() => ({
  retryEnquiry: vi.fn(async () => ({ ok: true })),
  saveFields: vi.fn(async () => ({ ok: true, changed: ["dates"], requote: true, draft: "ok" })),
  reroute: vi.fn(async () => ({ ok: true, changed: true })),
  saveDraft: vi.fn(async () => ({ ok: true, priceWarning: false })),
  regenerateDraft: vi.fn(async () => ({ ok: true })),
  approveAndSend: vi.fn(async () => ({ ok: true, sentAt: "", channel: "email" })),
  close: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/modules/enquiries", () => ({
  retryEnquiry: svc.retryEnquiry,
  inbox: {
    saveFields: svc.saveFields,
    reroute: svc.reroute,
    saveDraft: svc.saveDraft,
    regenerateDraft: svc.regenerateDraft,
    approveAndSend: svc.approveAndSend,
    close: svc.close,
  },
}));

import { auth } from "@/lib/auth/config";
import type { Role } from "@/lib/auth";
import {
  approveAndSendAction,
  closeAction,
  regenerateAction,
  rerouteAction,
  retryFailedEnquiry,
  saveDraftAction,
  saveFieldsAction,
} from "./actions";

const session = (role: Role | null) =>
  vi
    .mocked(auth)
    .mockResolvedValue(
      (role ? { user: { id: "u1", email: "u@x.test", name: "U", role } } : null) as never,
    );

const form = () => {
  const f = new FormData();
  f.set("enquiryId", "ENQ-1");
  f.set("expectedUpdatedAt", "2026-11-09T00:00:00.000Z");
  f.set("expectedAttempts", "3");
  return f;
};

beforeEach(() => Object.values(svc).forEach((f) => f.mockClear()));

describe("Retry AI is GM only (enquiries.unsorted)", () => {
  it.each(["reservations", "sales", "guest", null] as const)(
    "%s cannot retry and nothing is queued",
    async (role) => {
      session(role);
      expect(await retryFailedEnquiry("", form())).toBe("Your role cannot retry enquiries.");
      expect(svc.retryEnquiry).not.toHaveBeenCalled();
    },
  );
  it("gm queues the retry", async () => {
    session("gm");
    expect(await retryFailedEnquiry("", form())).toMatch(/Retry queued/);
    expect(svc.retryEnquiry).toHaveBeenCalledOnce();
  });
});

describe("inbox actions check the permission before the service", () => {
  const actions = [
    ["saveFieldsAction", () => saveFieldsAction({ enquiryId: "ENQ-1" }), svc.saveFields],
    ["rerouteAction", () => rerouteAction({ enquiryId: "ENQ-1" }), svc.reroute],
    ["saveDraftAction", () => saveDraftAction({ enquiryId: "ENQ-1" }), svc.saveDraft],
    ["regenerateAction", () => regenerateAction({ enquiryId: "ENQ-1" }), svc.regenerateDraft],
    [
      "approveAndSendAction",
      () => approveAndSendAction({ enquiryId: "ENQ-1" }),
      svc.approveAndSend,
    ],
    ["closeAction", () => closeAction({ enquiryId: "ENQ-1" }), svc.close],
  ] as const;
  it.each(actions)("%s: guests and signed out are refused, nothing called", async (_, run, fn) => {
    for (const role of ["guest", null] as const) {
      session(role);
      expect(await run()).toEqual({ ok: false, message: "Your role cannot do this." });
    }
    expect(fn).not.toHaveBeenCalled();
  });
  it.each(actions)("%s: staff reach the service with their own actor", async (_, run, fn) => {
    for (const role of ["reservations", "sales", "gm"] as const) {
      session(role);
      expect(await run()).toMatchObject({ ok: true });
    }
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn.mock.calls.map((c) => (c as unknown[])[1])).toEqual([
      { userId: "u1", role: "reservations" },
      { userId: "u1", role: "sales" },
      { userId: "u1", role: "gm" },
    ]);
  });
});
