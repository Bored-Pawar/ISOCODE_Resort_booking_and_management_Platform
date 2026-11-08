import { describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({ auth: vi.fn() }));

import { BOOKING_STAFF_ROLES } from "@/modules/booking";
import { auth } from "./config";
import {
  CAPABILITIES,
  can,
  navFor,
  requirePermission,
  rolesFor,
  type Capability,
  canSeeEnquiry,
  enquiryVisibility,
} from "./permissions";
import { AccessError, ROLES, type Role } from "./types";

/**
 * The whole role x capability matrix (runbook section 1). Any change to PERMISSIONS must change
 * this table too, so it shows in review.
 */
const MATRIX: Record<Capability, Record<Role, boolean>> = {
  "rates.edit": { guest: false, reservations: true, sales: false, gm: true },
  "allotment.edit": { guest: false, reservations: true, sales: false, gm: true },
  "availability.toggle": { guest: false, reservations: true, sales: false, gm: true },
  "promos.manage": { guest: false, reservations: true, sales: false, gm: true },
  "bookings.view": { guest: false, reservations: true, sales: false, gm: true },
  "enquiries.room": { guest: false, reservations: true, sales: false, gm: true },
  "enquiries.events": { guest: false, reservations: false, sales: true, gm: true },
  "enquiries.complaints": { guest: false, reservations: false, sales: false, gm: true },
  "enquiries.unsorted": { guest: false, reservations: false, sales: false, gm: true },
  "attention.request": { guest: false, reservations: false, sales: true, gm: true },
  "attention.resolve": { guest: false, reservations: true, sales: false, gm: true },
  "notifications.gm": { guest: false, reservations: false, sales: false, gm: true },
};

describe("permissions matrix", () => {
  it("covers exactly the runbook capabilities", () => {
    expect([...CAPABILITIES].sort()).toEqual(Object.keys(MATRIX).sort());
  });

  const cases = CAPABILITIES.flatMap((cap) =>
    ROLES.map((role) => [cap, role, MATRIX[cap][role]] as const),
  );
  it.each(cases)("%s for %s is %s", (cap, role, expected) => {
    expect(can(role, cap)).toBe(expected);
  });

  it("gm holds every capability, guests none, sales no stock, rate, promo or booking authority", () => {
    expect(CAPABILITIES.every((c) => can("gm", c))).toBe(true);
    expect(CAPABILITIES.some((c) => can("guest", c))).toBe(false);
    for (const c of [
      "rates.edit",
      "allotment.edit",
      "availability.toggle",
      "promos.manage",
      "bookings.view",
    ] as const)
      expect(can("sales", c)).toBe(false);
  });

  it("no role at all holds nothing", () => {
    expect(can(null, "bookings.view")).toBe(false);
    expect(can(undefined, "rates.edit")).toBe(false);
  });

  it("bookings.view matches the booking service's own staff check", () => {
    expect(rolesFor("bookings.view").sort()).toEqual([...BOOKING_STAFF_ROLES].sort());
  });
});

describe("requirePermission", () => {
  const session = (role: Role | null) =>
    vi
      .mocked(auth)
      .mockResolvedValue(
        (role ? { user: { id: "u1", email: "u@x.test", name: "U", role } } : null) as never,
      );

  it("returns the user when the role holds the capability", async () => {
    session("reservations");
    await expect(requirePermission("rates.edit")).resolves.toMatchObject({ role: "reservations" });
  });

  it("throws FORBIDDEN for a role without it and for guests", async () => {
    session("sales");
    await expect(requirePermission("rates.edit")).rejects.toThrow(AccessError);
    await expect(requirePermission("rates.edit")).rejects.toThrow("FORBIDDEN");
    session("guest");
    await expect(requirePermission("promos.manage")).rejects.toThrow("FORBIDDEN");
  });

  it("throws UNAUTHENTICATED without a session", async () => {
    session(null);
    await expect(requirePermission("bookings.view")).rejects.toThrow("UNAUTHENTICATED");
  });
});

describe("navFor", () => {
  const hrefs = (role: Role) => navFor(role).map((n) => n.href);
  it("reservations: overview, bookings, rates, allotment, promos (no unsorted queue)", () => {
    expect(hrefs("reservations")).toEqual([
      "/admin",
      "/admin/bookings",
      "/admin/rates",
      "/admin/allotment",
      "/admin/promos",
    ]);
  });
  it("sales: overview only (the unsorted queue is GM only)", () => {
    expect(hrefs("sales")).toEqual(["/admin"]);
  });
  it("gm: everything built, including the unsorted queue", () => {
    expect(hrefs("gm")).toEqual([
      "/admin",
      "/admin/inbox",
      "/admin/bookings",
      "/admin/rates",
      "/admin/allotment",
      "/admin/promos",
    ]);
  });
  it("the unsorted queue appears exactly for roles holding enquiries.unsorted", () => {
    for (const role of ROLES)
      expect(hrefs(role).includes("/admin/inbox")).toBe(can(role, "enquiries.unsorted"));
  });
  it("guests get no staff nav", () => {
    expect(navFor("guest")).toEqual([]);
    expect(navFor(null)).toEqual([]);
  });
});

describe("enquiryVisibility (2.4)", () => {
  it("reservations: room and other, sorted lane, no complaints", () => {
    expect(enquiryVisibility("reservations")).toEqual({
      categories: ["room", "other"],
      lanes: ["sorted"],
      complaints: false,
    });
  });
  it("sales: wedding and offsite, sorted lane, no complaints", () => {
    expect(enquiryVisibility("sales")).toEqual({
      categories: ["wedding", "offsite"],
      lanes: ["sorted"],
      complaints: false,
    });
  });
  it("gm: all categories, complaints and the unsorted lane", () => {
    expect(enquiryVisibility("gm")).toEqual({
      categories: ["room", "other", "wedding", "offsite", "complaint"],
      lanes: ["sorted", "unsorted"],
      complaints: true,
    });
  });
  it("guests and no role: nothing", () => {
    const none = { categories: [], lanes: [], complaints: false };
    expect(enquiryVisibility("guest")).toEqual(none);
    expect(enquiryVisibility(null)).toEqual(none);
  });

  const sorted = (category: "room" | "wedding" | "offsite" | "other") =>
    ({ category, lane: "sorted", isComplaint: false }) as const;
  const cases = [
    ["reservations", sorted("room"), true],
    ["reservations", sorted("other"), true],
    ["reservations", sorted("wedding"), false],
    ["sales", sorted("offsite"), true],
    ["sales", sorted("room"), false],
    ["gm", sorted("wedding"), true],
    // A room enquiry flagged as a complaint is GM only (complaints always alert the GM).
    ["reservations", { category: "room", lane: "sorted", isComplaint: true }, false],
    ["gm", { category: "room", lane: "sorted", isComplaint: true }, true],
    ["sales", { category: "complaint", lane: "sorted", isComplaint: false }, false],
    // Unsorted (low confidence or failed AI) is the GM lane, whatever the guessed category.
    ["reservations", { category: "room", lane: "unsorted", isComplaint: false }, false],
    ["sales", { category: null, lane: "unsorted", isComplaint: false }, false],
    ["gm", { category: null, lane: "unsorted", isComplaint: false }, true],
    ["guest", sorted("room"), false],
  ] as const;
  it.each(cases)("canSeeEnquiry %s %o is %s", (role, e, expected) => {
    expect(canSeeEnquiry(role, e)).toBe(expected);
  });
});
