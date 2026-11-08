import { describe, expect, it } from "vitest";
import { initials } from "./format";

describe("initials", () => {
  it("takes the first and last word", () => {
    expect(initials("Meera Nair", "m@x.in")).toBe("MN");
    expect(initials("  ravi  shankar kumar ", "r@x.in")).toBe("RK");
    expect(initials("asha", "a@x.in")).toBe("A");
  });
  it("falls back to the email, then a placeholder", () => {
    expect(initials("", "guest@example.com")).toBe("G");
    expect(initials(" ", "")).toBe("?");
  });
});
