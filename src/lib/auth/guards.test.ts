import { describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({ auth: vi.fn() }));

import { assertGuestOwner, assertRole } from "./guards";
import { AccessError, type SessionUser } from "./types";

const guest: SessionUser = { id: "g1", email: "g@x.test", name: "G", role: "guest" };
const gm: SessionUser = { id: "s1", email: "s@x.test", name: "S", role: "gm" };

describe("guards", () => {
  it("requires a session", () => {
    expect(() => assertRole(null, ["gm"])).toThrowError(AccessError);
    expect(() => assertRole(null, ["gm"])).toThrow("UNAUTHENTICATED");
  });
  it("checks the role", () => {
    expect(assertRole(gm, ["gm", "reservations"])).toBe(gm);
    expect(() => assertRole(guest, ["gm"])).toThrow("FORBIDDEN");
  });
  it("lets only the owning guest through", () => {
    expect(assertGuestOwner(guest, "g1")).toBe(guest);
    expect(() => assertGuestOwner(guest, "g2")).toThrow("FORBIDDEN");
    expect(() => assertGuestOwner(gm, "g1")).toThrow("FORBIDDEN");
    expect(() => assertGuestOwner(null, "g1")).toThrow("UNAUTHENTICATED");
  });
});
