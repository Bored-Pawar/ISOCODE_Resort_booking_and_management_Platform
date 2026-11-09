import { expect, test, type Page } from "@playwright/test";

/**
 * H2: security headers are present and the CSP blocks nothing the app needs. Run against
 * `pnpm build && pnpm start` (E2E_BASE_URL). Any CSP violation, console error or failed page
 * load fails the test. Read only: logs in as the seeded GM, changes nothing.
 */
test.skip(!process.env.E2E_BASE_URL, "E2E_BASE_URL not set");

function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.name}`));
  return problems;
}

async function visit(page: Page, path: string, problems: string[]) {
  const res = await page.goto(path, { waitUntil: "networkidle" });
  expect(res?.status(), path).toBeLessThan(400);
  const violations = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        document.addEventListener("securitypolicyviolation", () => n++);
        setTimeout(() => resolve(n), 500);
      }),
  );
  expect(violations, `${path} CSP violations`).toBe(0);
  expect(problems, path).toEqual([]);
}

const PUBLIC = [
  "/",
  "/rooms",
  "/rooms?checkIn=2026-12-10&checkOut=2026-12-12&adults=2",
  "/rooms/garden-villa",
  "/enquire",
  "/login",
  "/signup",
  "/admin/login",
];

test("headers on every response", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("default-src 'self'");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("public pages load with no CSP violation or console error", async ({ page }) => {
  const problems = watch(page);
  for (const path of PUBLIC) await visit(page, path, problems);
});

test("staff pages load with no CSP violation or console error", async ({ page }) => {
  const problems = watch(page);
  await page.goto("/admin/login");
  await page.getByLabel("Work email").fill("gm@companya.example");
  await page.getByRole("textbox", { name: "Password" }).fill("Demo@12345");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin(?!\/login)/);
  for (const path of [
    "/admin",
    "/admin/inbox",
    "/admin/rates",
    "/admin/allotment",
    "/admin/promos",
    "/admin/bookings",
  ])
    await visit(page, path, problems);
});

test("a failed staff login keeps the email and says what went wrong", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Work email").fill("gm@companya.example");
  await page.getByRole("textbox", { name: "Password" }).fill("wrong-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await expect(page.getByLabel("Work email")).toHaveValue("gm@companya.example");
  await expect(page.getByRole("textbox", { name: "Password" })).toHaveValue("");
});
