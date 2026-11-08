import { describe, expect, it } from "vitest";
import { redactPii } from "./pii";
describe("precise name minimization", () => {
  it.each([
    "Landline 2345 6789",
    "Call 080-2345-6789",
    "STD: (022) 2345 6789",
    "Contact +91 98765 43210 or guest@example.test",
  ])("redacts contact formats: %s", (raw) => {
    expect(redactPii(raw)).not.toMatch(/2345|6789|98765|guest@example/);
  });
  it.each(["Regards,", "Thanks,", "Warm regards,", "Best regards,"])(
    "redacts sign-off name following %s",
    (signoff) => {
      const clean = redactPii(
        `Pool Villa for 2 adults.\n${signoff}\nPriya Sharma\nLandline 2345 6789`,
      );
      expect(clean).not.toMatch(/Priya|Sharma|2345|6789/);
      expect(clean).toContain("Pool Villa for 2 adults");
    },
  );
  it("redacts PIN address while preserving adjacent booking facts", () => {
    const clean = redactPii(
      "Pool Villa 14/11/2026 to 16/11/2026 for 2 adults and 1 child.\nAddress: Flat 4B Palm Grove, Bandra West, Mumbai 400050. Need a projector.",
    );
    expect(clean).not.toMatch(/Palm|Bandra|Mumbai|400050|4B/);
    expect(clean).toContain("14/11/2026 to 16/11/2026 for 2 adults and 1 child");
    expect(clean).toContain("Pool Villa");
    expect(clean).toContain("Need a projector");
  });
  it("does not consume the headcount beside a phone or an ordinary budget", () => {
    const clean = redactPii("2345 6789 2 adults, 1 child. Pool Villa 14-16 Nov. Budget INR 30000.");
    expect(clean).not.toContain("2345");
    expect(clean).toContain("2 adults");
    expect(clean).toContain("1 child");
    expect(clean).toContain("14-16 Nov");
    expect(clean).toContain("INR 30000");
  });
  it.each([
    "My name is Priya and we want the Pool Villa.",
    "Pool Villa please. My name is Priya",
    "We need a room. My name is Priya and we want the Pool Villa.",
    "My name is Priya Sharma for 2 adults in the Pool Villa.",
  ])("preserves booking requirements after a name: %s", (raw) => {
    const clean = redactPii(raw, {
      senderName: "Mrs Shalini",
      senderContact: "sender@example.test",
    });
    expect(clean).not.toMatch(/Priya|Sharma/);
    expect(clean).toContain("Pool Villa");
  });
  it("known sender tokens use word boundaries at beginning, middle and end", () => {
    expect(
      redactPii("Priya wants a Pool Villa. Ask Priya. Regards Priya", { senderName: "Priya" }),
    ).not.toContain("Priya");
    expect(redactPii("Garden Villa for guests", { senderName: "Guest" })).toContain("guests");
  });
});
