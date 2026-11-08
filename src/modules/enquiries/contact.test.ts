import { describe, expect, it } from "vitest";
import { isUsableContact } from "./contact";
import { ingestInputSchema } from "./types";

describe("isUsableContact", () => {
  it("accepts emails and phones with at least 10 digits", () => {
    expect(isUsableContact("meera@example.com")).toBe(true);
    expect(isUsableContact("+91 98765 43210")).toBe(true);
    expect(isUsableContact("919876543210")).toBe(true);
    expect(isUsableContact("98765-43210")).toBe(true);
  });
  it("rejects values that normalise to nothing or too few digits", () => {
    expect(isUsableContact("--------")).toBe(false);
    expect(isUsableContact("+---------")).toBe(false);
    expect(isUsableContact("123456789")).toBe(false);
    expect(isUsableContact("call me maybe")).toBe(false);
    expect(isUsableContact("12ab345678901")).toBe(false);
    expect(isUsableContact("not@an email")).toBe(false);
  });
});

describe("ingest input contact", () => {
  const base = { channel: "web", senderName: "Meera", rawText: "Hello there, a wedding" };
  it("fails closed on an unusable contact", () => {
    expect(ingestInputSchema.safeParse({ ...base, senderContact: "--------" }).success).toBe(false);
    expect(ingestInputSchema.safeParse({ ...base, senderContact: "hello world" }).success).toBe(
      false,
    );
  });
  it("accepts a usable one", () => {
    expect(ingestInputSchema.safeParse({ ...base, senderContact: "m@x.com" }).success).toBe(true);
    expect(ingestInputSchema.safeParse({ ...base, senderContact: "+919876543210" }).success).toBe(
      true,
    );
  });
});
