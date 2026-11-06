import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("allows same-site paths", () => expect(safeNext("/admin/rates", "/x")).toBe("/admin/rates"));
  it("blocks external and protocol-relative urls", () => {
    expect(safeNext("https://evil.example", "/x")).toBe("/x");
    expect(safeNext("//evil.example", "/x")).toBe("/x");
    expect(safeNext("/\\evil.example", "/x")).toBe("/x");
    expect(safeNext(undefined, "/x")).toBe("/x");
  });
});
