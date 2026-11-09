import { beforeEach, expect, it, vi } from "vitest";
import { resetRateLimits, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";

const ingestFrom = vi.fn();
vi.mock("@/modules/enquiries", async (orig) => ({
  ...(await orig<typeof import("@/modules/enquiries")>()),
  enquiries: { ingestFrom: (...a: unknown[]) => ingestFrom(...a) },
}));
vi.mock("@/modules/catalog", () => ({ catalog: { getRoomTypeBySlug: vi.fn() } }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.7" }),
}));

const { submitEnquiryAction } = await import("./actions");

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const good = {
  name: "Asha Guest",
  contact: "asha@example.test",
  message: "Do you have a villa free next weekend for two adults?",
  consent: "on",
};

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  ingestFrom.mockResolvedValue({ ok: true, enquiryId: "ENQ-1" });
});

it("a validation error keeps every typed value, the consent tick and a new attempt", async () => {
  const first = await submitEnquiryAction(undefined, form({ ...good, contact: "x" }));
  expect(first).toMatchObject({
    fieldErrors: { contact: expect.any(String) },
    values: { name: "Asha Guest", contact: "x", message: good.message, consent: "on" },
    attempt: 1,
  });
  const second = await submitEnquiryAction(first, form({ ...good, contact: "x" }));
  expect(second?.attempt).toBe(2);
  expect(ingestFrom).not.toHaveBeenCalled();
});

it("success has no attempt and returns the reference", async () => {
  expect(await submitEnquiryAction(undefined, form(good))).toEqual({
    sent: { enquiryId: "ENQ-1" },
  });
});

it("rate limit: the fourth enquiry from one contact in ten minutes is refused, input kept", async () => {
  for (let i = 0; i < 3; i++) await submitEnquiryAction(undefined, form(good));
  const res = await submitEnquiryAction(undefined, form(good));
  expect(res).toMatchObject({ error: RATE_LIMITED_MESSAGE, values: { name: "Asha Guest" } });
  expect(ingestFrom).toHaveBeenCalledTimes(3);
});
