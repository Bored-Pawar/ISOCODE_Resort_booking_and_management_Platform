import { describe, expect, it } from "vitest";
import { canSeeEnquiry, type EnquiryCategory } from "@/lib/auth/permissions";
import { ROLES } from "@/lib/auth/types";
import {
  addsNewPrice,
  attentionOpen,
  badgeLanesFor,
  canView,
  canWork,
  defaultOwnerRole,
  formatWaiting,
  isAttentionRequest,
  isAttentionResolve,
  lanesFor,
  listInputSchema,
  noteSchema,
  ownerRolesFor,
  rupeeFigures,
} from "./rules";

describe("lanesFor (runbook roles table)", () => {
  it("reservations: mine, rooms, other, needs attention", () => {
    expect(lanesFor("reservations")).toEqual(["mine", "room", "other", "attention"]);
  });
  it("sales: mine, weddings, offsites (no attention lane, no complaints, no unsorted)", () => {
    expect(lanesFor("sales")).toEqual(["mine", "wedding", "offsite"]);
  });
  it("gm: every lane", () => {
    expect(lanesFor("gm")).toEqual([
      "mine",
      "room",
      "wedding",
      "offsite",
      "other",
      "complaints",
      "unsorted",
      "attention",
      "failed",
    ]);
  });
  it("guests and no role: none", () => {
    expect(lanesFor("guest")).toEqual([]);
    expect(lanesFor(null)).toEqual([]);
  });
  it("count badges only on unsorted, complaints and needs attention", () => {
    expect(badgeLanesFor("gm")).toEqual(["complaints", "unsorted", "attention"]);
    expect(badgeLanesFor("reservations")).toEqual(["attention"]);
    expect(badgeLanesFor("sales")).toEqual([]);
  });
});

const cats: (EnquiryCategory | null)[] = ["room", "wedding", "offsite", "complaint", "other", null];
const rows = cats.flatMap((category) =>
  (["sorted", "unsorted"] as const).flatMap((lane) =>
    [true, false].map((isComplaint) => ({ category, lane, isComplaint })),
  ),
);

describe("visibility", () => {
  it("canWork is exactly canSeeEnquiry for every role and row", () => {
    for (const role of ROLES)
      for (const row of rows) expect(canWork(role, row)).toBe(canSeeEnquiry(role, row));
  });
  it("attention extends viewing for reservations, never to complaints, never for sales", () => {
    const wedding = { category: "wedding" as const, lane: "sorted" as const, isComplaint: false };
    expect(canView("reservations", { ...wedding, attentionRequested: true })).toBe(true);
    expect(canView("reservations", { ...wedding, attentionRequested: false })).toBe(false);
    expect(canWork("reservations", wedding)).toBe(false);
    expect(
      canView("reservations", { ...wedding, isComplaint: true, attentionRequested: true }),
    ).toBe(false);
    const room = { category: "room" as const, lane: "sorted" as const, isComplaint: false };
    expect(canView("sales", { ...room, attentionRequested: true })).toBe(false);
  });
  it("complaints are GM only whatever their category", () => {
    for (const category of cats)
      for (const role of ROLES)
        expect(
          canView(role, { category, lane: "sorted", isComplaint: true, attentionRequested: true }),
        ).toBe(role === "gm");
  });
  it("owner roles follow the category; complaints only the GM", () => {
    expect(ownerRolesFor("room", false)).toEqual(["reservations", "gm"]);
    expect(ownerRolesFor("wedding", false)).toEqual(["sales", "gm"]);
    expect(ownerRolesFor("room", true)).toEqual(["gm"]);
    expect(ownerRolesFor("complaint", false)).toEqual(["gm"]);
    expect(defaultOwnerRole("other", false)).toBe("reservations");
    expect(defaultOwnerRole("offsite", false)).toBe("sales");
    expect(defaultOwnerRole("room", true)).toBe("gm");
  });
});

describe("attention lane (latest request without a later resolve)", () => {
  const req = (at: string) => ({
    action: "rerouted",
    fromValue: "please look",
    toValue: "attention",
    at,
  });
  const res = (at: string) => ({
    action: "rerouted",
    fromValue: "attention",
    toValue: "seen: ok",
    at,
  });
  it("open after a request, closed after a resolve, reopened by a later request", () => {
    expect(attentionOpen([])).toBe(false);
    expect(attentionOpen([req("2026-11-09T10:00:00Z")])).toBe(true);
    expect(attentionOpen([req("2026-11-09T10:00:00Z"), res("2026-11-09T11:00:00Z")])).toBe(false);
    expect(
      attentionOpen([
        req("2026-11-09T10:00:00Z"),
        res("2026-11-09T11:00:00Z"),
        req("2026-11-09T12:00:00Z"),
      ]),
    ).toBe(true);
  });
  it("order of rows does not matter, and other reroutes are ignored", () => {
    expect(
      attentionOpen([
        res("2026-11-09T11:00:00Z"),
        { action: "rerouted", fromValue: "room", toValue: "wedding", at: "2026-11-09T12:00:00Z" },
        req("2026-11-09T10:00:00Z"),
      ]),
    ).toBe(false);
  });
  it("a normal re-route is neither a request nor a resolve", () => {
    const e = { action: "rerouted", fromValue: "room", toValue: "other", at: "" };
    expect(isAttentionRequest(e) || isAttentionResolve(e)).toBe(false);
    expect(
      isAttentionResolve({ action: "rerouted", fromValue: "attention", toValue: "seenx" }),
    ).toBe(false);
  });
  it("notes are required and at most 500 characters", () => {
    expect(noteSchema.safeParse("  ").success).toBe(false);
    expect(noteSchema.safeParse("x".repeat(500)).success).toBe(true);
    expect(noteSchema.safeParse("x".repeat(501)).success).toBe(false);
  });
});

describe("list input", () => {
  it("defaults to mine and rejects unknown lanes, statuses and bad cursors", () => {
    expect(listInputSchema.parse({}).lane).toBe("mine");
    expect(listInputSchema.safeParse({ lane: "everything" }).success).toBe(false);
    expect(listInputSchema.safeParse({ status: "open" }).success).toBe(false);
    expect(listInputSchema.safeParse({ cursor: "'; drop table" }).success).toBe(false);
    expect(listInputSchema.safeParse({ cursor: "2026-11-09T10:00:00.000Z|ENQ-4411" }).success).toBe(
      true,
    );
  });
});

describe("formatWaiting", () => {
  const t = "2026-11-09T10:00:00Z";
  it("minutes, hours and days", () => {
    expect(formatWaiting(t, "2026-11-09T10:14:59Z")).toBe("14 m");
    expect(formatWaiting(t, "2026-11-09T12:14:00Z")).toBe("2 h 14 m");
    expect(formatWaiting(t, "2026-11-12T12:14:00Z")).toBe("3 d 2 h");
    expect(formatWaiting(t, "2026-11-09T09:00:00Z")).toBe("0 m");
  });
});

describe("price warning on edit (hard rule 3)", () => {
  const draft = "From ₹12,400 (room only, including ₹1,328 GST).";
  it("reads ₹, Rs and INR figures", () => {
    expect(rupeeFigures("₹12,400, Rs. 500 and INR 3000.00")).toEqual(["12400", "500", "3000"]);
  });
  it("warns only for a rupee figure the quote did not contain", () => {
    expect(addsNewPrice(draft, `${draft} Thanks!`)).toBe(false);
    expect(addsNewPrice(draft, draft.replace("₹12,400", "₹12400"))).toBe(false);
    expect(addsNewPrice(draft, `${draft} A discount to ₹10,000 is possible.`)).toBe(true);
    expect(addsNewPrice("No price here.", "It is Rs 999 per night.")).toBe(true);
  });
});
