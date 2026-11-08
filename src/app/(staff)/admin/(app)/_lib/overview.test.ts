import { describe, expect, it } from "vitest";
import { navFor } from "@/lib/auth/permissions";
import { overviewFor } from "./overview";

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
        if (item.kind === "pending") continue;
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
});
