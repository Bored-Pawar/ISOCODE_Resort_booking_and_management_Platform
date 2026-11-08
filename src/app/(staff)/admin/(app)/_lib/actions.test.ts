import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);

vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));
vi.mock("@/modules/admin", async (orig) => {
  const real = await orig<typeof import("@/modules/admin")>();
  const ok = vi.fn(async () => ({ ok: true }));
  return {
    ...real,
    admin: new Proxy({} as Record<string, unknown>, {
      get: (_, key) => (calls[key as string] ??= ok),
    }),
  };
});

import { auth } from "@/lib/auth/config";
import type { Role } from "@/lib/auth";
import { setRatesAction } from "../rates/actions";
import { setAllotmentAction } from "../allotment/actions";

const R = "8b0f2c62-4d3b-4a63-9a8e-0b9c1d2e3f40";
const session = (role: Role | null) =>
  vi
    .mocked(auth)
    .mockResolvedValue(
      (role ? { user: { id: "u1", email: "u@x.test", name: "U", role } } : null) as never,
    );

/** Every admin action with a valid input, so only the permission decides. */
const ACTIONS: [string, () => Promise<{ ok: boolean; code?: string }>][] = [
  [
    "setRatesAction",
    () =>
      setRatesAction({
        mode: "range",
        roomTypeIds: [R],
        planCodes: ["EP"],
        from: "2099-01-01",
        to: "2099-01-02",
        days: [5],
        rupees: 100,
      }),
  ],
  [
    "setAllotmentAction",
    () =>
      setAllotmentAction({
        mode: "cells",
        cells: [{ roomTypeId: R, date: "2099-01-01", allotment: 2 }],
      }),
  ],
];

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
});

describe("admin server actions check the permission first (test 8)", () => {
  it.each(ACTIONS)(
    "%s: sales, guest and signed out get FORBIDDEN and the service is not called",
    async (_, run) => {
      for (const role of ["sales", "guest", null] as const) {
        session(role);
        expect(await run()).toEqual({ ok: false, code: "FORBIDDEN" });
      }
      expect(Object.keys(calls)).toEqual([]);
    },
  );
  it.each(ACTIONS)("%s: reservations and gm reach the service", async (_, run) => {
    for (const role of ["reservations", "gm"] as const) {
      session(role);
      expect(await run()).toMatchObject({ ok: true });
    }
    expect(Object.keys(calls)).toHaveLength(1);
  });
});
