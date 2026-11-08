import { afterEach, describe, expect, it, vi } from "vitest";
import { INBOUND_SECRET_HEADER } from "@/modules/enquiries";

const handler = vi.fn(async (req: Request) => Response.json({ url: req.url }, { status: 200 }));

vi.mock("@/app/api/inbound/email/route", () => ({ POST: (r: Request) => handler(r) }));
vi.mock("@/app/api/inbound/whatsapp/route", () => ({ POST: (r: Request) => handler(r) }));

import { postInboundInProcess } from "./in-process";

afterEach(() => vi.restoreAllMocks());

describe("postInboundInProcess", () => {
  it("calls the handler directly with the secret and never uses the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await postInboundInProcess("email", { a: 1 }, "s3cret");
    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    const req = handler.mock.calls.at(-1)![0];
    expect(req.method).toBe("POST");
    expect(req.headers.get(INBOUND_SECRET_HEADER)).toBe("s3cret");
    expect(new URL(req.url).pathname).toBe("/api/inbound/email");
    expect(await req.json()).toEqual({ a: 1 });
  });

  it("is not influenced by forged Host / x-forwarded-* headers", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    // The helper takes no headers at all; ambient request headers are also mocked as hostile.
    vi.doMock("next/headers", () => ({
      headers: async () =>
        new Headers({
          host: "attacker.invalid",
          "x-forwarded-host": "attacker.invalid",
          "x-forwarded-proto": "https",
        }),
    }));
    await postInboundInProcess("whatsapp", {}, "s3cret");
    expect(fetchSpy).not.toHaveBeenCalled();
    const req = handler.mock.calls.at(-1)![0];
    expect(new URL(req.url).host).toBe("inbound.invalid");
    expect(req.url).not.toContain("attacker");
  });

  it("the action module no longer reads request headers", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/next\/headers/);
    expect(src).not.toMatch(/\bfetch\(/);
  });
});
