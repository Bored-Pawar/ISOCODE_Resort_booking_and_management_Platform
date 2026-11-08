import { describe, expect, it, vi } from "vitest";
import { createHoldLatch, holdPhase, HOLD_WARNING_MS } from "./hold-latch";

const T = Date.parse("2099-11-14T10:00:00Z");

describe("holdPhase", () => {
  it("is active, warning under 2 minutes, expired at zero", () => {
    expect(holdPhase(HOLD_WARNING_MS)).toBe("active");
    expect(holdPhase(HOLD_WARNING_MS - 1)).toBe("warning");
    expect(holdPhase(1)).toBe("warning");
    expect(holdPhase(0)).toBe("expired");
    expect(holdPhase(-5)).toBe("expired");
  });
});

describe("createHoldLatch (R07)", () => {
  it("fires onExpire once at zero", () => {
    const latch = createHoldLatch();
    const onExpire = vi.fn();
    latch.tick(T, T - 1000, { onExpire });
    expect(onExpire).not.toHaveBeenCalled();
    latch.tick(T, T, { onExpire });
    latch.tick(T, T + 1000, { onExpire });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("a rerender after zero with a new inline callback fires nothing", () => {
    const latch = createHoldLatch();
    const first = vi.fn();
    latch.tick(T, T + 1, { onExpire: first });
    const second = vi.fn();
    latch.tick(T, T + 2, { onExpire: () => second() });
    latch.tick(T, T + 3, { onExpire: () => second() });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("a new expiresAt arms it again", () => {
    const latch = createHoldLatch();
    const onExpire = vi.fn();
    latch.tick(T, T + 1, { onExpire });
    const refreshed = T + 600_000;
    latch.tick(refreshed, T + 2, { onExpire });
    expect(onExpire).toHaveBeenCalledTimes(1);
    latch.tick(refreshed, refreshed, { onExpire });
    expect(onExpire).toHaveBeenCalledTimes(2);
  });

  it("fires onWarning once under 2 minutes, again for a new target", () => {
    const latch = createHoldLatch();
    const onWarning = vi.fn();
    latch.tick(T, T - HOLD_WARNING_MS, { onWarning });
    expect(onWarning).not.toHaveBeenCalled();
    latch.tick(T, T - HOLD_WARNING_MS + 1, { onWarning });
    latch.tick(T, T - 1000, { onWarning: () => onWarning() });
    expect(onWarning).toHaveBeenCalledTimes(1);
    latch.tick(T + 600_000, T + 600_000 - 1000, { onWarning });
    expect(onWarning).toHaveBeenCalledTimes(2);
  });

  it("a hold already past zero on first tick fires expiry, not the warning", () => {
    const latch = createHoldLatch();
    const onWarning = vi.fn();
    const onExpire = vi.fn();
    expect(latch.tick(T, T + 5000, { onWarning, onExpire })).toBe(-5000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onWarning).not.toHaveBeenCalled();
  });
});
