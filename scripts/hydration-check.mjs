// H5: look for React hydration warnings, which only `pnpm dev` reports. Visits the key screens
// signed out, as the seeded guest and as the GM (twice each, the second after the compile) and
// prints every console warning or error that mentions hydration or a mismatch.
// Usage: DEV_TOOLS_ENABLED=true pnpm dev -p 3300, then node scripts/hydration-check.mjs http://localhost:3300
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3300";
const hits = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });

async function visit(page, who, paths) {
  for (const path of paths)
    for (let pass = 0; pass < 2; pass++) {
      await page.goto(base + path, { waitUntil: "networkidle", timeout: 180_000 });
      await page.waitForTimeout(500);
    }
  console.log(`${who}: ${paths.length} pages`);
}

async function session(who, paths, loginPath, email, label) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    const t = m.text();
    if (
      (m.type() === "error" || m.type() === "warning") &&
      /hydrat|did not match|mismatch/i.test(t)
    )
      hits.push({ who, url: page.url(), text: t.slice(0, 300) });
  });
  if (loginPath) {
    await page.goto(base + loginPath, { timeout: 180_000 });
    await page.getByRole("textbox", { name: label }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill("Demo@12345");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 180_000 });
  }
  await visit(page, who, paths);
  await ctx.close();
}

await session("signed-out", [
  "/",
  "/rooms",
  "/rooms/garden-villa",
  "/enquire",
  "/login",
  "/signup",
  "/admin/login",
]);
await session("guest", ["/account", "/"], "/login", "asha@guest.example", "Email");
await session(
  "gm",
  [
    "/admin",
    "/admin/inbox",
    "/admin/rates",
    "/admin/allotment",
    "/admin/promos",
    "/admin/bookings",
    "/dev/outbox",
  ],
  "/admin/login",
  "gm@companya.example",
  "Work email",
);
await browser.close();
const visited = [];
console.log(JSON.stringify(hits, null, 2));
writeFileSync(
  "docs/screenshots/final/hydration.json",
  JSON.stringify(
    { at: new Date().toISOString(), pages: 16, loadsPerPage: 2, warnings: hits },
    null,
    2,
  ) + "\n",
);
console.log(`${hits.length} hydration warnings`);
