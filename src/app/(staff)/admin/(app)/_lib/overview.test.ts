import { describe, expect, it } from "vitest";
import { navFor } from "@/lib/auth/permissions";
import { lanesFor } from "@/modules/enquiries/staff/rules";
import { overviewFor, overviewLanes } from "./overview";

const TODAY = "2026-11-08";
const labels = (role: "reservations" | "sales" | "gm") =>
  overviewFor(role, TODAY).items.map((i) => i.label);

describe("staff landing by role (2.2)", () => {
  it("reservations: arrivals, room enquiries, attention requests, rates, allotment, promos", () => {
    expect(labels("reservations")).toEqual([
      "Arrivals today",
      "Open room enquiries",
      "Needs attention from sales",
      "Rates",
      "Allotment",
      "Promo codes",
    ]);
  });
  it("sales: open event enquiries only", () => {
    expect(labels("sales")).toEqual(["Open wedding and offsite enquiries"]);
  });
  it("gm: complaints, unsorted and both departments", () => {
    expect(labels("gm")).toEqual([
      "Arrivals today",
      "Open complaints",
      "Unsorted enquiries",
      "Open room enquiries",
      "Open wedding and offsite enquiries",
      "Needs attention from sales",
      "Rates",
      "Allotment",
      "Promo codes",
    ]);
  });
  it("no dead links: every link is a screen in the role's nav", () => {
    for (const role of ["reservations", "sales", "gm"] as const) {
      const nav = navFor(role).map((n) => n.href);
      for (const item of overviewFor(role, TODAY).items) {
        const path = item.href.split("?")[0];
        expect(nav, `${role} ${item.href}`).toContain(path);
      }
    }
  });
  it("arrivals link filters confirmed check-ins today", () => {
    const item = overviewFor("reservations", TODAY).items[0];
    expect(item).toMatchObject({
      kind: "arrivals",
      href: "/admin/bookings?status=CONFIRMED&from=2026-11-08&to=2026-11-08",
    });
  });
  it("enquiry rows count only lanes the role may open and link to the first of them", () => {
    for (const role of ["reservations", "sales", "gm"] as const) {
      const allowed = lanesFor(role);
      for (const item of overviewFor(role, TODAY).items) {
        if (item.kind !== "enquiries") continue;
        for (const lane of item.lanes) expect(allowed, `${role} ${lane}`).toContain(lane);
        expect(item.href).toBe(`/admin/inbox?lane=${item.lanes[0]}`);
      }
    }
  });
  it("one counts call per role, no duplicate lanes", () => {
    expect(overviewLanes(overviewFor("gm", TODAY).items)).toEqual([
      "complaints",
      "unsorted",
      "room",
      "wedding",
      "offsite",
      "attention",
    ]);
    expect(overviewLanes(overviewFor("sales", TODAY).items)).toEqual(["wedding", "offsite"]);
    expect(overviewLanes(overviewFor("reservations", TODAY).items)).toEqual(["room", "attention"]);
  });
  it("no row says the inbox is still to come", () => {
    for (const role of ["reservations", "sales", "gm"] as const)
      expect(JSON.stringify(overviewFor(role, TODAY))).not.toMatch(/Coming with the inbox/);
  });
});
