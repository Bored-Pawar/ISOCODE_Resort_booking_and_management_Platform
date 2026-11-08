import { describe, expect, it } from "vitest";
import { redactPii } from "./pii";
describe("precise name minimization", () => {
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
