import { describe, expect, it, vi } from "vitest";
import { send } from "./transport";

describe("send (QA-05 transport failures)", () => {
  it("returns the action result when the call resolves", async () => {
    const res = await send(async () => ({ ok: true as const, changed: 3 }));
    expect(res).toEqual({ sent: true, value: { ok: true, changed: 3 } });
  });

  it("keeps business failures as values, not transport failures", async () => {
    const res = await send(async () => ({ ok: false as const, code: "INVALID_INPUT" }));
    expect(res).toEqual({ sent: true, value: { ok: false, code: "INVALID_INPUT" } });
  });

  it("turns a rejected call (Failed to fetch) into sent: false instead of throwing", async () => {
    const call = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(send(call)).resolves.toEqual({ sent: false });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("does not retry by itself: a retry is always the user's choice", async () => {
    const call = vi.fn(() => Promise.reject(new Error("network")));
    await send(call);
    await send(call);
    expect(call).toHaveBeenCalledTimes(2);
  });
});
