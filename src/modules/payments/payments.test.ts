import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/modules/booking", () => ({ booking: { confirmPayment: vi.fn() } }));
import { booking } from "@/modules/booking";
import { bookingFixture } from "@/modules/booking/fixtures";
import { POST } from "@/app/api/payments/mock/route";
import { MockProvider, mockPaymentId, PAYMENT_SIGNATURE_HEADER } from "./index";
import { handleMockWebhook, signPayload, verifySignature } from "./webhook";

const SECRET = "test-payment-secret-0123456789";
const bookingId = randomUUID();
const attemptId = randomUUID();
const payload = {
  providerPaymentId: mockPaymentId(bookingId, attemptId),
  bookingId,
  amountPaise: 1240000,
  status: "SUCCESS",
};

function post(body: string, signature?: string) {
  return POST(
    new Request("http://pay.invalid/api/payments/mock", {
      method: "POST",
      headers: signature ? { [PAYMENT_SIGNATURE_HEADER]: signature } : {},
      body,
    }),
  );
}

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("mock webhook", () => {
  it("fails closed when the secret is unset or too short", async () => {
    const body = JSON.stringify(payload);
    vi.stubEnv("PAYMENT_WEBHOOK_SECRET", undefined);
    expect((await post(body, signPayload(body, SECRET))).status).toBe(401);
    vi.stubEnv("PAYMENT_WEBHOOK_SECRET", "short");
    expect((await post(body, signPayload(body, "short"))).status).toBe(401);
    expect(booking.confirmPayment).not.toHaveBeenCalled();
  });

  it("rejects a missing, wrong or tampered signature", async () => {
    vi.stubEnv("PAYMENT_WEBHOOK_SECRET", SECRET);
    const body = JSON.stringify(payload);
    expect((await post(body)).status).toBe(401);
    expect((await post(body, signPayload(body, "another-secret-entirely"))).status).toBe(401);
    const tampered = JSON.stringify({ ...payload, amountPaise: 1 });
    expect((await post(tampered, signPayload(body, SECRET))).status).toBe(401);
    expect(verifySignature(body, "zz", SECRET)).toBe(false);
    expect(booking.confirmPayment).not.toHaveBeenCalled();
  });

  it("validates the signed body before confirming", async () => {
    vi.stubEnv("PAYMENT_WEBHOOK_SECRET", SECRET);
    for (const bad of ["not json", JSON.stringify({ ...payload, status: "FAILED" })]) {
      expect((await post(bad, signPayload(bad, SECRET))).status).toBe(400);
    }
    expect(booking.confirmPayment).not.toHaveBeenCalled();
  });

  it("confirms with the signed amount and maps outcomes", async () => {
    vi.stubEnv("PAYMENT_WEBHOOK_SECRET", SECRET);
    vi.mocked(booking.confirmPayment).mockResolvedValue({
      ok: true,
      outcome: "CONFIRMED",
      booking: { ...bookingFixture, status: "CONFIRMED" },
    });
    const body = JSON.stringify(payload);
    const res = await post(body, signPayload(body, SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: "CONFIRMED", status: "CONFIRMED" });
    expect(booking.confirmPayment).toHaveBeenCalledWith({
      bookingId,
      provider: "mock",
      providerPaymentId: payload.providerPaymentId,
      amountPaise: 1240000,
    });
    vi.mocked(booking.confirmPayment).mockResolvedValue({ ok: false, code: "AMOUNT_MISMATCH" });
    expect((await handleMockWebhook(body, signPayload(body, SECRET))).status).toBe(409);
  });
});

describe("MockProvider", () => {
  it("success signs and delivers a webhook with one payment id per attempt", async () => {
    vi.stubEnv("PAYMENT_WEBHOOK_SECRET", SECRET);
    const deliver = vi.fn(async (body: string, sig: string | null) => {
      expect(verifySignature(body, sig, SECRET)).toBe(true);
      return Response.json({ outcome: "CONFIRMED" });
    });
    const provider = new MockProvider({ outcome: "succeeds", attemptId }, deliver);
    const out = await provider.charge({ bookingId, amountPaise: 1240000 });
    expect(out).toEqual({
      status: "SUCCESS",
      providerPaymentId: `mock_${bookingId}_${attemptId}`,
      amountPaise: 1240000,
    });
    expect(JSON.parse(deliver.mock.calls[0][0])).toEqual(payload);
    // A double click with the same attempt sends the same payment id (replayed by confirmPayment).
    await provider.charge({ bookingId, amountPaise: 1240000 });
    expect(JSON.parse(deliver.mock.calls[1][0]).providerPaymentId).toBe(payload.providerPaymentId);
  });

  it("declined and timeout send no webhook; a refused webhook reads as a timeout", async () => {
    const deliver = vi.fn(async () => Response.json({}, { status: 401 }));
    expect(
      await new MockProvider({ outcome: "declined", attemptId }, deliver).charge({
        bookingId,
        amountPaise: 1,
      }),
    ).toMatchObject({ status: "FAILED" });
    expect(
      await new MockProvider({ outcome: "timeout", attemptId }, deliver).charge({
        bookingId,
        amountPaise: 1,
      }),
    ).toEqual({ status: "TIMEOUT" });
    expect(deliver).not.toHaveBeenCalled();
    expect(
      await new MockProvider({ outcome: "succeeds", attemptId }, deliver).charge({
        bookingId,
        amountPaise: 1,
      }),
    ).toEqual({ status: "TIMEOUT" });
  });
});
