import { afterEach, expect, it, vi } from "vitest";
import { requireRole } from "@/lib/auth";
import { resetFailedEnquiry } from "./internal";
import { scheduleProcessing } from "./scheduling";
import { retryEnquiry } from "./retry";
vi.mock("@/lib/auth", () => ({ requireRole: vi.fn() }));
vi.mock("./internal", () => ({ resetFailedEnquiry: vi.fn() }));
vi.mock("./scheduling", () => ({ scheduleProcessing: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const input = {
  enquiryId: "ENQ-RETRY",
  expectedUpdatedAt: "2026-11-08T12:00:00.000Z",
  expectedAttempts: 3,
};
it("unauthorized retry never reaches persistence", async () => {
  vi.mocked(requireRole).mockRejectedValue(new Error("FORBIDDEN"));
  await expect(retryEnquiry(input)).rejects.toThrow("FORBIDDEN");
  expect(resetFailedEnquiry).not.toHaveBeenCalled();
});
it("authorized retry uses the session actor and only schedules a successful generation reset", async () => {
  vi.mocked(requireRole).mockResolvedValue({ id: "staff" } as never);
  vi.mocked(resetFailedEnquiry).mockResolvedValue(true);
  expect(await retryEnquiry(input)).toEqual({ ok: true });
  expect(requireRole).toHaveBeenCalledWith("reservations", "sales", "gm");
  expect(resetFailedEnquiry).toHaveBeenCalledWith(input, "staff");
  expect(scheduleProcessing).toHaveBeenCalledWith("ENQ-RETRY");
});
it("stale generation and malformed retry do not schedule work", async () => {
  vi.mocked(requireRole).mockResolvedValue({ id: "staff" } as never);
  vi.mocked(resetFailedEnquiry).mockResolvedValue(false);
  expect(await retryEnquiry(input)).toMatchObject({ ok: false, code: "STALE_OR_PROTECTED" });
  expect(await retryEnquiry({ ...input, expectedAttempts: -1 })).toMatchObject({
    ok: false,
    code: "INVALID_INPUT",
  });
  expect(scheduleProcessing).not.toHaveBeenCalled();
});
