import { describe, expect, it } from "vitest";
import { roomsSummary, statusView } from "./account";

const now = Date.parse("2026-11-08T10:00:00Z");
const today = "2026-11-08";

describe("statusView", () => {
  it("shows a live hold as held and a lapsed one as expired", () => {
    const held = { status: "HELD" as const, checkOut: "2026-11-20" };
    expect(
      statusView({ ...held, holdExpiresAt: "2026-11-08T10:05:00Z" }, now, today),
    ).toMatchObject({ label: "Held, awaiting payment", group: "upcoming" });
    expect(
      statusView({ ...held, holdExpiresAt: "2026-11-08T10:00:00Z" }, now, today),
    ).toMatchObject({ label: "Hold expired", group: "closed" });
    expect(statusView({ ...held, holdExpiresAt: null }, now, today).group).toBe("closed");
  });
  it("splits confirmed stays at check-out", () => {
    const c = { status: "CONFIRMED" as const, holdExpiresAt: null };
    expect(statusView({ ...c, checkOut: "2026-11-09" }, now, today).label).toBe("Confirmed");
    expect(statusView({ ...c, checkOut: "2026-11-08" }, now, today).label).toBe("Past stay");
  });
  it("labels expired and cancelled bookings", () => {
    const base = { holdExpiresAt: null, checkOut: "2026-11-20" };
    expect(statusView({ ...base, status: "EXPIRED" }, now, today).label).toBe("Hold expired");
    expect(statusView({ ...base, status: "CANCELLED" }, now, today).tone).toBe("danger");
  });
});

describe("roomsSummary", () => {
  it("names rooms in line order and counts repeats", () => {
    const names = new Map([
      ["a", "Plantation Room"],
      ["b", "Estate Suite"],
    ]);
    const rooms = [
      { roomTypeId: "a" },
      { roomTypeId: "b" },
      { roomTypeId: "b" },
      { roomTypeId: "z" },
    ];
    expect(roomsSummary(rooms, names)).toBe("Plantation Room, 2 x Estate Suite, Room");
  });
});
