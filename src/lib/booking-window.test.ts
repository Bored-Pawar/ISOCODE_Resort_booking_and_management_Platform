import { describe, expect, it } from "vitest";
import { lastOnlineCheckIn, withinBookingWindow } from "./booking-window";

describe("lastOnlineCheckIn", () => {
  it("adds 3 calendar months on the same day", () => {
    expect(lastOnlineCheckIn("2026-11-08")).toBe("2027-02-08");
    expect(lastOnlineCheckIn("2026-01-15")).toBe("2026-04-15");
  });
  it("clamps to the last day of a shorter month", () => {
    expect(lastOnlineCheckIn("2026-11-30")).toBe("2027-02-28");
    expect(lastOnlineCheckIn("2027-11-30")).toBe("2028-02-29"); // leap year
    expect(lastOnlineCheckIn("2026-08-31")).toBe("2026-11-30");
    expect(lastOnlineCheckIn("2026-03-31")).toBe("2026-06-30");
  });
  it("crosses the year end", () => {
    expect(lastOnlineCheckIn("2026-10-31")).toBe("2027-01-31");
    expect(lastOnlineCheckIn("2026-12-31")).toBe("2027-03-31");
  });
});

describe("withinBookingWindow", () => {
  it("allows check-in on the last day and refuses the day after", () => {
    expect(withinBookingWindow("2027-02-08", "2026-11-08")).toBe(true);
    expect(withinBookingWindow("2027-02-09", "2026-11-08")).toBe(false);
    expect(withinBookingWindow("2026-11-08", "2026-11-08")).toBe(true);
  });
});
