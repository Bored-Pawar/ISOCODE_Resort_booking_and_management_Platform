/**
 * Pure timing rules behind HoldTimer (R07). Callbacks fire once per hold target timestamp, never
 * once per callback identity, so a parent that re-renders with a new inline callback after zero
 * cannot fire expiry twice. A new target (a refreshed hold) arms both callbacks again.
 */

/** Under this many milliseconds left, the hold is in its warning state and payment is gated. */
export const HOLD_WARNING_MS = 120_000;

export type HoldPhase = "active" | "warning" | "expired";

export function holdPhase(remainingMs: number): HoldPhase {
  if (remainingMs <= 0) return "expired";
  if (remainingMs < HOLD_WARNING_MS) return "warning";
  return "active";
}

export type HoldCallbacks = { onWarning?: () => void; onExpire?: () => void };

export type HoldLatch = {
  /** Returns the milliseconds left and fires a callback the first time its phase is reached. */
  tick(target: number, now: number, callbacks: HoldCallbacks): number;
};

export function createHoldLatch(): HoldLatch {
  let warnedFor: number | null = null;
  let expiredFor: number | null = null;
  return {
    tick(target, now, { onWarning, onExpire }) {
      const left = target - now;
      const phase = holdPhase(left);
      if (phase === "expired") {
        if (expiredFor !== target) {
          expiredFor = target;
          // Expiry implies the warning for this target is no longer useful.
          warnedFor = target;
          onExpire?.();
        }
      } else if (phase === "warning" && warnedFor !== target) {
        warnedFor = target;
        onWarning?.();
      }
      return left;
    },
  };
}
