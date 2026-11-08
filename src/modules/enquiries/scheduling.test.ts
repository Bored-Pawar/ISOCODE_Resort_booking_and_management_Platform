import { afterEach, describe, expect, it, vi } from "vitest";
import { after } from "next/server";
import { aiRouter } from "@/modules/ai-router";
import { enquiries } from "./index";
import { sweepCandidates } from "./internal";
import { listEnquiries, saveEnquiry } from "./store";
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/modules/ai-router", () => ({ aiRouter: { process: vi.fn() } }));
vi.mock("./internal", () => ({ SWEEP_LIMIT: 5, sweepCandidates: vi.fn() }));
vi.mock("./store", () => ({ saveEnquiry: vi.fn(), listEnquiries: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const input = {
  channel: "web" as const,
  senderName: "Synthetic",
  senderContact: "test@example.test",
  rawText: "Synthetic enquiry for a villa",
};
async function runAfter() {
  await (vi.mocked(after).mock.calls[0][0] as () => Promise<void>)();
}
describe("after scheduling", () => {
  it("returns the persisted receipt before model work and sweeps at most five", async () => {
    vi.mocked(saveEnquiry).mockResolvedValue({ enquiryId: "ENQ-new", duplicate: false });
    vi.mocked(sweepCandidates).mockResolvedValue([
      "ENQ-old",
      "ENQ-new",
      "ENQ-2",
      "ENQ-3",
      "ENQ-4",
      "ENQ-5",
    ]);
    expect(await enquiries.ingest(input)).toEqual({
      ok: true,
      enquiryId: "ENQ-new",
      aiStatus: "pending",
    });
    expect(aiRouter.process).not.toHaveBeenCalled();
    await runAfter();
    expect(aiRouter.process).toHaveBeenCalledTimes(5);
    expect(vi.mocked(aiRouter.process).mock.calls[0][0]).toEqual({ enquiryId: "ENQ-new" });
  });
  it("inbox list schedules a recovery sweep", async () => {
    vi.mocked(listEnquiries).mockResolvedValue([]);
    vi.mocked(sweepCandidates).mockResolvedValue(["ENQ-stale"]);
    expect(await enquiries.list()).toEqual([]);
    await runAfter();
    expect(aiRouter.process).toHaveBeenCalledWith({ enquiryId: "ENQ-stale" });
  });
  it("a scheduling failure does not invalidate a saved receipt", async () => {
    vi.mocked(saveEnquiry).mockResolvedValue({ enquiryId: "ENQ-new", duplicate: false });
    vi.mocked(after).mockImplementation(() => {
      throw new Error("no request context");
    });
    expect(await enquiries.ingest(input)).toMatchObject({ ok: true, enquiryId: "ENQ-new" });
  });
  it("invalid intake schedules nothing", async () => {
    expect(await enquiries.ingest({ ...input, senderName: "" })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(after).not.toHaveBeenCalled();
    expect(saveEnquiry).not.toHaveBeenCalled();
  });
});
