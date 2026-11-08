import { afterEach, expect, it, vi } from "vitest";
import { claimEnquiry, settleEnquiry } from "@/modules/enquiries/internal";
import { classifyMessage } from "./classify";
import { selectQuote } from "./quote-selection";
import { processEnquiry } from "./processing";
import { classificationFixtures } from "./fixtures";
vi.mock("@/modules/enquiries/internal", () => ({
  claimEnquiry: vi.fn(),
  settleEnquiry: vi.fn(),
  ownerRoleFor: vi.fn(),
}));
vi.mock("./classify", () => ({ classifyMessage: vi.fn() }));
vi.mock("./quote-selection", () => ({ selectQuote: vi.fn() }));
afterEach(() => vi.resetAllMocks());
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
