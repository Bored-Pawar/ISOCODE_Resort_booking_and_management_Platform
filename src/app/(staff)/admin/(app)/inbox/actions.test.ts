import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const retryEnquiry = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("@/modules/enquiries", () => ({ retryEnquiry }));

import { auth } from "@/lib/auth/config";
import type { Role } from "@/lib/auth";
import { retryFailedEnquiry } from "./actions";

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

beforeEach(() => retryEnquiry.mockClear());

describe("unsorted queue retry is GM only (enquiries.unsorted)", () => {
  it.each(["reservations", "sales", "guest", null] as const)(
    "%s cannot retry and nothing is queued",
    async (role) => {
      session(role);
      expect(await retryFailedEnquiry("", form())).toBe("Your role cannot retry enquiries.");
      expect(retryEnquiry).not.toHaveBeenCalled();
    },
  );
  it("gm queues the retry", async () => {
    session("gm");
    expect(await retryFailedEnquiry("", form())).toMatch(/Retry queued/);
    expect(retryEnquiry).toHaveBeenCalledOnce();
  });
});
