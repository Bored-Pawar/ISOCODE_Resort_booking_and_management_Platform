import { describe, expect, it } from "vitest";
import {
  buildPostmarkPayload,
  buildWhatsAppPayload,
  extractEmailAddress,
  isValidInboundSecret,
  mapPostmarkEmail,
  mapWhatsApp,
  postmarkInboundSchema,
  whatsappInboundSchema,
} from "./inbound";
import { ingestInputSchema } from "./types";

describe("isValidInboundSecret", () => {
  it("accepts only an exact match", () => {
    expect(isValidInboundSecret("s3cret", "s3cret")).toBe(true);
    expect(isValidInboundSecret("s3cret!", "s3cret")).toBe(false);
    expect(isValidInboundSecret("S3CRET", "s3cret")).toBe(false);
  });
  it("fails closed when either side is missing or empty", () => {
    expect(isValidInboundSecret(null, "s3cret")).toBe(false);
    expect(isValidInboundSecret("", "")).toBe(false);
    expect(isValidInboundSecret("x", undefined)).toBe(false);
    expect(isValidInboundSecret(undefined, "x")).toBe(false);
  });
});

describe("email mapper (Postmark)", () => {
  const payload = {
    From: "meera@example.com",
    FromName: "Meera Nair",
    Subject: "Wedding venue",
    TextBody: "Venue for my sister's wedding in Feb 2027, about 250 guests, 2 nights",
    MessageID: "9f1d7c2e-0000-4000-8000-000000000001",
  };
  it("maps to an ingest input that passes the frozen schema", () => {
    const item = mapPostmarkEmail(postmarkInboundSchema.parse(payload));
    expect(item.source).toEqual({ provider: "postmark", messageId: payload.MessageID });
    expect(item.input).toMatchObject({
      channel: "email",
      senderName: "Meera Nair",
      senderContact: "meera@example.com",
    });
    expect(item.input.rawText).toBe(`Wedding venue\n\n${payload.TextBody}`);
    expect(ingestInputSchema.safeParse(item.input).success).toBe(true);
  });
  it("falls back to the local part when FromName is empty", () => {
    const item = mapPostmarkEmail(postmarkInboundSchema.parse({ ...payload, FromName: "" }));
    expect(item.input.senderName).toBe("meera");
  });
  it("accepts 'Name <addr>' and truncates very long bodies", () => {
    expect(extractEmailAddress("Meera <m@x.com>")).toBe("m@x.com");
    const item = mapPostmarkEmail(
      postmarkInboundSchema.parse({
        ...payload,
        From: "Meera <m@x.com>",
        TextBody: "a".repeat(9000),
      }),
    );
    expect(item.input.senderContact).toBe("m@x.com");
    expect(item.input.rawText.length).toBe(5000);
  });
  it("rejects a payload without MessageID or From", () => {
    expect(postmarkInboundSchema.safeParse({ ...payload, MessageID: undefined }).success).toBe(
      false,
    );
    expect(postmarkInboundSchema.safeParse({ ...payload, From: undefined }).success).toBe(false);
  });
  it("round-trips the builder", () => {
    const built = buildPostmarkPayload({
      fromEmail: "a@b.com",
      fromName: "A",
      subject: "Hi there",
      body: "Is a villa free?",
      messageId: "m-1",
    });
    expect(mapPostmarkEmail(postmarkInboundSchema.parse(built)).input.rawText).toContain("villa");
  });
});

describe("WhatsApp mapper (Meta Cloud API)", () => {
  const meta = buildWhatsAppPayload({
    phone: "+91 90000 00001",
    name: "Rohit Shetty",
    body: "Is a villa free 14-16 Nov for 2 adults and a child?",
    messageId: "wamid.AAA",
  });
  it("maps a text message with the contact profile name", () => {
    const { items, skipped } = mapWhatsApp(whatsappInboundSchema.parse(meta));
    expect(skipped).toBe(0);
    expect(items).toHaveLength(1);
    expect(items[0].source).toEqual({ provider: "whatsapp", messageId: "wamid.AAA" });
    expect(items[0].input).toMatchObject({
      channel: "whatsapp",
      senderName: "Rohit Shetty",
      senderContact: "+9190000000 01".replace(" ", ""),
    });
    expect(ingestInputSchema.safeParse(items[0].input).success).toBe(true);
  });
  it("handles several messages, skips non-text and status-only webhooks", () => {
    const value = {
      messages: [
        { id: "a", from: "919000000002", type: "text", text: { body: "Hello, need a room" } },
        { id: "b", from: "919000000002", type: "image" },
      ],
    };
    const r = mapWhatsApp(whatsappInboundSchema.parse({ entry: [{ changes: [{ value }] }] }));
    expect(r.items.map((i) => i.source.messageId)).toEqual(["a"]);
    expect(r.items[0].input.senderName).toBe("+919000000002");
    expect(r.skipped).toBe(1);
    const statusOnly = { entry: [{ changes: [{ value: { statuses: [{ id: "x" }] } }] }] };
    expect(mapWhatsApp(whatsappInboundSchema.parse(statusOnly))).toEqual({ items: [], skipped: 0 });
  });
  it("rejects a malformed message", () => {
    const bad = { entry: [{ changes: [{ value: { messages: [{ from: "91900000000" }] } }] }] };
    expect(whatsappInboundSchema.safeParse(bad).success).toBe(false);
  });
});
