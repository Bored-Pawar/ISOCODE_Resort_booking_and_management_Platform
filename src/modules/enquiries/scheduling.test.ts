import { afterEach, describe, expect, it, vi } from "vitest";
import { after } from "next/server";
import { recoverEnquiries } from "@/modules/ai-router";
import { enquiries } from "./index";
import { listEnquiries, saveEnquiry } from "./store";
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/modules/ai-router", () => ({ recoverEnquiries: vi.fn() }));
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
    expect(await enquiries.ingest(input)).toEqual({
      ok: true,
      enquiryId: "ENQ-new",
      aiStatus: "pending",
    });
    expect(recoverEnquiries).not.toHaveBeenCalled();
    await runAfter();
    expect(recoverEnquiries).toHaveBeenCalledExactlyOnceWith("ENQ-new");
  });
  it("inbox list schedules a recovery sweep", async () => {
    vi.mocked(listEnquiries).mockResolvedValue([]);
    expect(await enquiries.list()).toEqual([]);
    await runAfter();
    expect(recoverEnquiries).toHaveBeenCalledExactlyOnceWith(undefined);
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
