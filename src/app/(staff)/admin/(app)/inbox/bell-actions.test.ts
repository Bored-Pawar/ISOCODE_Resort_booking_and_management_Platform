import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));
const bell = { unread: 1, items: [] };
const svc = vi.hoisted(() => ({
  bell: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}));
vi.mock("@/modules/enquiries", () => ({ inbox: svc }));

import { auth } from "@/lib/auth/config";
import type { Role } from "@/lib/auth";
import { bellAction, markAllReadAction, markReadAction } from "./bell-actions";

const session = (role: Role | null) =>
  vi
    .mocked(auth)
    .mockResolvedValue(
      (role ? { user: { id: "u1", email: "u@x.test", name: "U", role } } : null) as never,
    );

beforeEach(() => {
  svc.bell.mockReset().mockResolvedValue({ ok: true, bell });
  svc.markRead.mockReset().mockResolvedValue({ ok: true, changed: true });
  svc.markAllRead.mockReset().mockResolvedValue({ ok: true, count: 1 });
});

describe("GM bell actions need notifications.gm", () => {
  const runs = [
    () => bellAction(),
    () => markReadAction({ id: "8b0f2c62-4d3b-4a63-9a8e-0b9c1d2e3f40" }),
    () => markAllReadAction(),
  ];
  it.each(["reservations", "sales", "guest", null] as const)("%s gets nothing", async (role) => {
    session(role);
    for (const run of runs) expect(await run()).toBeNull();
    expect(svc.bell).not.toHaveBeenCalled();
    expect(svc.markRead).not.toHaveBeenCalled();
    expect(svc.markAllRead).not.toHaveBeenCalled();
  });
  it("gm reads and marks with its own user id", async () => {
    session("gm");
    for (const run of runs) expect(await run()).toEqual(bell);
    expect(svc.markRead.mock.calls[0][1]).toEqual({ userId: "u1", role: "gm" });
    expect(svc.markAllRead.mock.calls[0][0]).toEqual({ userId: "u1", role: "gm" });
  });
});
