import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/modules/booking", () => ({ booking: { releaseExpiredHolds: vi.fn() } }));
vi.mock("@/modules/ai-router", () => ({ recoverEnquiries: vi.fn() }));
import { recoverEnquiries } from "@/modules/ai-router";
import { booking } from "@/modules/booking";
import { GET } from "./route";
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
describe("B4 expiry cron", () => {
  it("fails closed without configuration, or for absent/wrong credentials and invalid query input", async () => {
    vi.stubEnv("CRON_SECRET", undefined);
    expect((await GET(new Request("http://localhost/api/cron/expire-holds"))).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    for (const authorization of [undefined, "Bearer wrong", "Bearer", "test-cron-secret"]) {
      expect(
        (
          await GET(
            new Request("http://localhost/api/cron/expire-holds", {
              headers: authorization ? { authorization } : {},
            }),
          )
        ).status,
      ).toBe(401);
    }
    expect(
      (
        await GET(
          new Request("http://localhost/api/cron/expire-holds?roomTypeId=bad", {
            headers: { authorization: "Bearer test-cron-secret" },
          }),
        )
      ).status,
    ).toBe(401);
    expect(booking.releaseExpiredHolds).not.toHaveBeenCalled();
    expect(recoverEnquiries).not.toHaveBeenCalled();
  });
  it("authorised cron calls the site-wide sweep once and returns its real result", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.mocked(booking.releaseExpiredHolds).mockResolvedValue({ ok: true, released: 3 });
    vi.mocked(recoverEnquiries).mockResolvedValue({ claimed: 5, completed: 5 });
    const response = await GET(
      new Request("http://localhost/api/cron/expire-holds", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      released: 3,
      aiRecovery: { claimed: 5, completed: 5 },
    });
    expect(booking.releaseExpiredHolds).toHaveBeenCalledExactlyOnceWith();
    expect(recoverEnquiries).toHaveBeenCalledExactlyOnceWith();
  });
});
