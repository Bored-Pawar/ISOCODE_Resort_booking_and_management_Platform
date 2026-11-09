import { expect, it } from "vitest";
import config from "../../next.config";

it("every route gets the H2 security headers", async () => {
  const rules = await config.headers!();
  const all = rules.find((r) => r.source === "/:path*");
  const h = Object.fromEntries(all!.headers.map((x) => [x.key, x.value]));
  expect(h["X-Content-Type-Options"]).toBe("nosniff");
  expect(h["X-Frame-Options"]).toBe("DENY");
  expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d{8}/);
  expect(h["Permissions-Policy"]).toMatch(/camera=\(\)/);
  const csp = h["Content-Security-Policy"];
  for (const d of [
    "default-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ])
    expect(csp).toContain(d);
  expect(config.poweredByHeader).toBe(false);
});
