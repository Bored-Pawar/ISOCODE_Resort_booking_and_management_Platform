import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";
import { cn, FONT_SIZES } from "./utils";

describe("cn", () => {
  it("keeps a text colour next to a custom font size", () => {
    expect(cn("text-accent-foreground", "text-body").split(" ").sort()).toEqual([
      "text-accent-foreground",
      "text-body",
    ]);
    expect(cn("text-small text-muted").split(" ").sort()).toEqual(["text-muted", "text-small"]);
  });
  it("still lets a later colour or size override an earlier one", () => {
    expect(cn("text-muted", "text-danger")).toBe("text-danger");
    expect(cn("text-body", "text-small")).toBe("text-small");
  });
  it("covers every --text-* size declared in globals.css", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const declared = [...css.matchAll(/--text-([a-z0-9-]+):\s*\d+px;/g)]
      .map((m) => m[1])
      .filter((name) => !name.includes("--"));
    expect(declared.sort()).toEqual([...FONT_SIZES].sort());
  });
});

describe("primary button classes survive cn (white text on accent)", () => {
  it.each(["md", "sm"] as const)("size %s", (size) => {
    const cls = cn(buttonVariants({ variant: "primary", size }));
    expect(cls).toContain("bg-accent");
    expect(cls).toContain("text-accent-foreground");
    expect(cls).toContain("hover:bg-accent-hover");
  });
  it("keeps white text when a caller adds layout classes", () => {
    expect(cn(buttonVariants({ variant: "primary" }), "mt-6 w-full")).toContain(
      "text-accent-foreground",
    );
  });
});
