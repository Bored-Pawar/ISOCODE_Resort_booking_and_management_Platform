import { expect, it, vi } from "vitest";

const post = vi.fn(async () => new Response("ok"));
vi.mock("@/lib/auth/config", () => ({ handlers: { GET: vi.fn(), POST: post } }));

const { POST } = await import("./route");
const req = (path: string) => new Request(`http://localhost${path}`, { method: "POST" });

it("refuses the HTTP credentials endpoints, which would skip the login rate limit", async () => {
  for (const path of [
    "/api/auth/callback/staff",
    "/api/auth/callback/guest",
    "/api/auth/signin/staff",
    "/api/auth/signin",
    "/api/auth//callback/staff",
    "/api/auth/callback/",
  ]) {
    const res = await POST(req(path) as never);
    expect(res.status, path).toBe(404);
  }
  expect(post).not.toHaveBeenCalled();
});

it("other Auth.js POSTs still reach the handler", async () => {
  await POST(req("/api/auth/session") as never);
  expect(post).toHaveBeenCalledTimes(1);
});
