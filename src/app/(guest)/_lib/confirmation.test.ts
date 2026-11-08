import { describe, expect, it } from "vitest";
import { twoRoomBookingFixture } from "@/modules/booking/fixtures";
import { roomTypesFixture } from "@/modules/catalog/fixtures";
import {
  CHECK_IN_NOTE,
  confirmationEmail,
  confirmationIcs,
  confirmationLines,
  stateView,
} from "./confirmation";

const b = { ...twoRoomBookingFixture, status: "CONFIRMED" as const };

describe("confirmationLines", () => {
  it("gives one block per room line with its own GST, summing to the order", () => {
    const lines = confirmationLines(b, roomTypesFixture);
    expect(lines).toHaveLength(b.rooms.length);
    expect(lines.reduce((s, l) => s + l.totalPaise, 0)).toBe(b.totalPaise);
    expect(lines.reduce((s, l) => s + l.gstPaise, 0)).toBe(b.gstPaise);
    expect(lines[0].title).toMatch(/^Room 1: /);
  });
});

describe("stateView", () => {
  it("only CONFIRMED says confirmed", () => {
    expect(stateView("CONFIRMED", false).title).toBe("Your stay is confirmed");
    for (const s of ["HELD", "EXPIRED", "CANCELLED"] as const)
      for (const live of [true, false])
        expect(stateView(s, live).title).not.toMatch(/is confirmed/);
    expect(stateView("HELD", true).action).toBe("pay");
    expect(stateView("HELD", false).action).toBe("rebuild");
  });
});

describe("confirmationIcs", () => {
  it("is an all-day event from check-in to check-out with CRLF lines", () => {
    const ics = confirmationIcs(b, roomTypesFixture, new Date("2026-11-08T10:00:00Z"));
    expect(ics).toContain(`DTSTART;VALUE=DATE:${b.checkIn.replaceAll("-", "")}\r\n`);
    expect(ics).toContain(`DTEND;VALUE=DATE:${b.checkOut.replaceAll("-", "")}\r\n`);
    expect(ics).toContain(`UID:${b.ref}@`);
    expect(ics).toContain("DTSTAMP:20261108T100000Z");
    expect(ics.split("\r\n").every((l) => !l.includes("\n"))).toBe(true);
    expect(ics).toContain("passport");
  });
});

describe("confirmationEmail", () => {
  it("addresses the guest and carries ref, stay, lines, total and the check-in note", () => {
    const mail = confirmationEmail(b, roomTypesFixture, { name: "Asha", email: "asha@x.example" });
    expect(mail.to).toBe("asha@x.example");
    expect(mail.subject).toContain(b.ref);
    expect(mail.text).toContain("Hello Asha,");
    expect(mail.text).toContain(CHECK_IN_NOTE);
    expect(mail.text).toMatch(/Total paid: ₹/);
  });
});
