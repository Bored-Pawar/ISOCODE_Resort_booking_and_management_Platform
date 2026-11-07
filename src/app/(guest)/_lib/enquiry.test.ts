import { describe, expect, it } from "vitest";
import { enquiryHref, enquiryHrefFromQuery, parseEnquiryParams } from "./enquiry";
import { buildEnquirySchema, composeRawText } from "./enquiry-schema";

const TODAY = "2026-11-08";
const valid = {
  name: "Meera Nair",
  contact: "meera@example.com",
  message: "Venue for a wedding in February",
  consent: "on",
};
const parse = (o: Record<string, string>) =>
  buildEnquirySchema(TODAY).safeParse({ ...valid, ...o });
const firstError = (o: Record<string, string>) => {
  const r = parse(o);
  return r.success ? null : { path: r.error.issues[0].path[0], message: r.error.issues[0].message };
};

describe("enquiryHref", () => {
  it("is plain /enquire without params", () => {
    expect(enquiryHref()).toBe("/enquire");
  });
  it("carries the stay, party and room", () => {
    const href = enquiryHref({
      checkIn: "2026-11-14",
      checkOut: "2026-11-16",
      adults: 6,
      children: 0,
      room: "pool-villa",
    });
    expect(href).toBe(
      "/enquire?checkIn=2026-11-14&checkOut=2026-11-16&adults=6&children=0&room=pool-villa",
    );
  });
  it("drops invalid dates and slugs instead of emitting them", () => {
    expect(enquiryHref({ checkIn: "", checkOut: "2026-13-40", room: "Bad Slug!" })).toBe(
      "/enquire",
    );
  });
  it("carries a rooms query string over", () => {
    const href = enquiryHrefFromQuery(
      "checkIn=2026-11-14&checkOut=2026-11-16&adults=5&children=2",
      "estate-suite",
    );
    expect(parseEnquiryParams(Object.fromEntries(new URL(href, "http://x").searchParams))).toEqual({
      checkIn: "2026-11-14",
      checkOut: "2026-11-16",
      adults: 5,
      children: 2,
      room: "estate-suite",
    });
  });
});

describe("parseEnquiryParams", () => {
  it("ignores garbage and clamps counts", () => {
    expect(
      parseEnquiryParams({ checkIn: "tomorrow", adults: "9999", children: "-1", room: "../x" }),
    ).toEqual({});
    expect(parseEnquiryParams({ adults: "400", children: "250" })).toEqual({
      adults: 400,
      children: 200,
    });
  });
  it("needs at least one adult and reads the first of repeated params", () => {
    expect(parseEnquiryParams({ adults: "0" })).toEqual({});
    expect(parseEnquiryParams({ adults: ["3", "5"] })).toEqual({ adults: 3 });
  });
});

describe("enquiry schema", () => {
  it("accepts the minimum: name, contact, message, consent", () => {
    expect(parse({}).success).toBe(true);
  });
  it("accepts an email or a phone, nothing else", () => {
    expect(parse({ contact: "+91 98765 43210" }).success).toBe(true);
    expect(firstError({ contact: "not-a-contact" })?.path).toBe("contact");
    expect(firstError({ contact: "12" })?.path).toBe("contact");
  });
  it("requires consent", () => {
    const r = buildEnquirySchema(TODAY).safeParse({ ...valid, consent: undefined });
    expect(r.success).toBe(false);
  });
  it("rejects a short message", () => {
    expect(firstError({ message: "hi" })?.path).toBe("message");
  });
  it("treats blank optional fields as absent", () => {
    const r = parse({ checkIn: "", checkOut: "", adults: "", children: "" });
    expect(r.success).toBe(true);
  });
  it("validates the date pair", () => {
    expect(firstError({ checkIn: "2026-11-10" })?.path).toBe("checkOut");
    expect(firstError({ checkOut: "2026-11-10" })?.path).toBe("checkIn");
    expect(firstError({ checkIn: "2026-11-01", checkOut: "2026-11-03" })?.message).toMatch(/past/);
    expect(firstError({ checkIn: "2026-11-12", checkOut: "2026-11-12" })?.path).toBe("checkOut");
    expect(firstError({ checkIn: "2026-11-12", checkOut: "2027-06-01" })?.path).toBe("checkOut");
    expect(parse({ checkIn: "2026-11-12", checkOut: "2026-11-14" }).success).toBe(true);
  });
  it("validates guest counts", () => {
    expect(firstError({ adults: "abc" })?.path).toBe("adults");
    expect(firstError({ adults: "1.5" })?.path).toBe("adults");
    expect(firstError({ adults: "-2" })?.path).toBe("adults");
    expect(firstError({ children: "5000" })?.path).toBe("children");
    expect(parse({ adults: "250", children: "0" }).success).toBe(true);
  });
});

describe("composeRawText", () => {
  it("appends dates, party and room as plain lines and never the contact", () => {
    const r = parse({
      checkIn: "2026-11-14",
      checkOut: "2026-11-16",
      adults: "2",
      children: "1",
      message: "Is a villa free?",
    });
    if (!r.success) throw new Error("expected valid");
    const text = composeRawText(r.data, "Pool Villa");
    expect(text).toBe(
      "Is a villa free?\n\nDates: 2026-11-14 to 2026-11-16\nGuests: 2 adults, 1 child\nRoom of interest: Pool Villa",
    );
    expect(text).not.toContain("meera@example.com");
  });
  it("is just the message when nothing else was given", () => {
    const r = parse({ message: "Only the message here" });
    if (!r.success) throw new Error("expected valid");
    expect(composeRawText(r.data)).toBe("Only the message here");
  });
});
