import { afterEach, expect, it, vi } from "vitest";
import { claimEnquiry, settleEnquiry, failClaim } from "@/modules/enquiries/internal";
import { classifyMessage } from "./classify";
import { selectQuote } from "./quote-selection";
import { processEnquiry } from "./processing";
import { classificationFixtures } from "./fixtures";
vi.mock("@/modules/enquiries/internal", () => ({
  claimEnquiry: vi.fn(),
  settleEnquiry: vi.fn(),
  ownerRoleFor: vi.fn(),
  failClaim: vi.fn(),
}));
vi.mock("./classify", () => ({ classifyMessage: vi.fn() }));
vi.mock("./quote-selection", () => ({ selectQuote: vi.fn() }));
afterEach(() => vi.resetAllMocks());
it("processing exceptions record the claimed attempt failure without exposing the error", async () => {
  const claim = { row: { rawText: "Synthetic" }, attempt: 3 };
  vi.mocked(claimEnquiry).mockResolvedValue({ kind: "claimed", claim } as never);
  vi.mocked(classifyMessage).mockRejectedValue(new Error("private payload"));
  vi.mocked(failClaim).mockResolvedValue(undefined);
  expect(await processEnquiry({ enquiryId: "ENQ-FAIL" })).toEqual({ ok: false, code: "FAILED" });
  expect(failClaim).toHaveBeenCalledWith(claim);
});
it("unsupported model extraction preserves classification/routing, persists evidence, never calls quoting", async () => {
  const classification = {
    ...classificationFixtures["ENQ-4411"].classification,
    dates: { from: "2027-02-28", to: "2027-03-01" },
  };
  vi.mocked(claimEnquiry).mockResolvedValue({
    kind: "claimed",
    claim: { row: { rawText: "2027-02-30 to 2027-03-01 for -2 adults and 1.5 children" } },
  } as never);
  vi.mocked(classifyMessage).mockResolvedValue({
    classification,
    status: "ok",
    draftText: "Thank you. {{QUOTE}}",
    response: { kind: "success", provider: "mock", model: "test", latencyMs: 1 },
    text: "redacted",
  } as never);
  vi.mocked(settleEnquiry).mockResolvedValue({ lane: "sorted", ownerId: "staff" } as never);
  expect(await processEnquiry({ enquiryId: "ENQ-T27" })).toMatchObject({
    ok: true,
    status: "ok",
    classification,
    ownerRole: "reservations",
  });
  expect(selectQuote).not.toHaveBeenCalled();
  expect(vi.mocked(settleEnquiry).mock.calls[0][1]).toMatchObject({
    category: "room",
    extracted: { grounding: { dates: "unsupported", guests: "unsupported" } },
    draft: { quote: null },
  });
  expect(vi.mocked(settleEnquiry).mock.calls[0][1].draft.body).toContain("confirm your dates");
});
it("a high-confidence room label still persists a GM complaint alert without changing owner", async () => {
  const classification = classificationFixtures["ENQ-4411"].classification;
  vi.mocked(claimEnquiry).mockResolvedValue({
    kind: "claimed",
    claim: { row: { rawText: "Room ganda tha. Need another room." } },
  } as never);
  vi.mocked(classifyMessage).mockResolvedValue({
    classification,
    status: "ok",
    draftText: null,
    response: { kind: "success", provider: "mock", model: "test", latencyMs: 1 },
  } as never);
  vi.mocked(settleEnquiry).mockResolvedValue({ lane: "sorted", ownerId: "reservations" } as never);
  expect(await processEnquiry({ enquiryId: "ENQ-MIXED" })).toMatchObject({
    ok: true,
    ownerRole: "reservations",
    notifyGm: true,
  });
  expect(vi.mocked(settleEnquiry).mock.calls[0][1]).toMatchObject({
    ownerRole: "reservations",
    category: "room",
    notifyGm: true,
  });
});
