import { afterEach, expect, it, vi } from "vitest";
import { claimSweep } from "@/modules/enquiries/internal";
import { processEnquiry } from "./processing";
import { recoverEnquiries } from "./recovery";
vi.mock("@/modules/enquiries/internal", () => ({ claimSweep: vi.fn(), SWEEP_LIMIT: 5 }));
vi.mock("./processing", () => ({ processEnquiry: vi.fn() }));
afterEach(() => vi.resetAllMocks());
it("recovery processes a bounded claimed batch, preserving each generation", async () => {
  const claims = Array.from({ length: 6 }, (_, i) => ({
    row: { id: `ENQ-${i}` },
    attempt: 2,
    updatedAt: new Date(),
  }));
  vi.mocked(claimSweep).mockResolvedValue(claims as never);
  vi.mocked(processEnquiry).mockResolvedValue({ ok: true } as never);
  expect(await recoverEnquiries()).toEqual({ claimed: 5, completed: 5 });
  expect(processEnquiry).toHaveBeenCalledTimes(5);
  expect(processEnquiry).toHaveBeenCalledWith({ enquiryId: "ENQ-0" }, claims[0]);
});
it("one failed worker does not stop other recovery workers", async () => {
  vi.mocked(claimSweep).mockResolvedValue([
    { row: { id: "ENQ-1" } },
    { row: { id: "ENQ-2" } },
  ] as never);
  vi.mocked(processEnquiry)
    .mockRejectedValueOnce(new Error("synthetic"))
    .mockResolvedValue({ ok: true } as never);
  expect(await recoverEnquiries()).toEqual({ claimed: 2, completed: 1 });
});
