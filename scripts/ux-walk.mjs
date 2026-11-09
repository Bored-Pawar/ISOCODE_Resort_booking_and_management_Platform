// H4/H5 walk: every key screen at 1280px and 375px, signed out, as a guest and as each staff
// role. Per screen: HTTP status, console errors, horizontal overflow, axe (WCAG 2 A/AA, serious
// and critical), a visible focus ring after Tab, and a screenshot for the TDD.
// Usage: DEV_TOOLS_ENABLED=true pnpm start -p 3300 (development database), then
//   node scripts/ux-walk.mjs http://localhost:3300 [--shots]
// Writes docs/screenshots/final/walk.json (and screenshots with --shots). Creates one HELD
// booking for the seeded guest, once, before the width loop (it expires on its own); reseed
// afterwards for a clean demo.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3300";
const shots = process.argv.includes("--shots");
const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const outDir = "docs/screenshots/final";
mkdirSync(outDir, { recursive: true });

const istDate = (days) =>
  new Date(Date.now() + 5.5 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
const search = `/rooms?checkIn=${istDate(21)}&checkOut=${istDate(23)}&adults=2&children=0`;
const WIDTHS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 375, height: 812 },
];
const results = [];
const linkChecked = new Map(); // persona|href -> status

/** Every internal link on the page, fetched once per persona with its session (no dead links). */
async function deadLinks(page, persona) {
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll("a[href]")]
      .map((a) => a.getAttribute("href"))
      .filter((h) => h && h.startsWith("/") && !h.startsWith("//")),
  );
  const dead = [];
  // Page routes only: API routes and downloads are skipped so a GET with an effect is never hit.
  for (const href of new Set(
    hrefs.filter((h) => !h.startsWith("/api/") && !/\.ics(\?|$)/.test(h)),
  )) {
    const key = `${persona}|${href}`;
    if (!linkChecked.has(key)) {
      const r = await page.request.get(base + href, { maxRedirects: 5 }).catch(() => null);
      linkChecked.set(key, r ? r.status() : 0);
    }
    const status = linkChecked.get(key);
    if (status === 0 || status >= 400) dead.push(`${href} ${status}`);
  }
  return dead;
}

async function login(page, path, email, label = "Email") {
  await page.goto(base + path);
  await page.getByRole("textbox", { name: label }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill("Demo@12345");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30_000 });
}

async function cartDetails(page) {
  await page.goto(base + search, { waitUntil: "networkidle" });
  await page
    .getByRole("article")
    .filter({ hasText: "Plantation Room" })
    .getByRole("button", { name: "Add room" })
    .click();
  await page.getByRole("button", { name: "Continue" }).first().click();
  await page.waitForURL(/\/book\/details\?.*quoteHash=/);
  return new URL(page.url()).pathname + new URL(page.url()).search;
}

async function check(page, persona, screen, path, width) {
  const errors = [];
  const onConsole = (m) => m.type() === "error" && errors.push(m.text().slice(0, 200));
  const onPageError = (e) => errors.push(`pageerror ${e.name}: ${e.message.slice(0, 160)}`);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  const res = await page.goto(base + path, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await page.addScriptTag({ path: axePath });
  const axe = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    });
    return r.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
        targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
      }));
  });
  const dead = await deadLinks(page, persona);
  // Screenshot before the focus probe, so no focus outline shows in the TDD images.
  if (shots)
    await page.screenshot({
      path: `${outDir}/${screen}-${width.name}.jpg`,
      fullPage: true,
      type: "jpeg",
      quality: 70,
    });
  // Focus ring: Tab once from the top and inspect the focused element.
  await page.mouse.click(1, 1);
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { ok: false, what: "nothing focused" };
    const s = getComputedStyle(el);
    const ring =
      (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
      (s.boxShadow && s.boxShadow !== "none");
    return {
      ok: !!ring,
      what: `${el.tagName.toLowerCase()} ${(el.textContent ?? "").trim().slice(0, 30)}`,
    };
  });
  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  const row = {
    persona,
    screen,
    width: width.name,
    path: path.replace(/quoteHash=[^&]+/, "quoteHash=…"),
    status: res?.status() ?? 0,
    title: await page.title(),
    overflowPx: overflow,
    consoleErrors: errors,
    deadLinks: dead,
    axe,
    focus,
  };
  results.push(row);
  console.log(
    `${persona.padEnd(12)} ${screen.padEnd(16)} ${width.name.padEnd(7)} ${row.status} overflow=${overflow} errors=${errors.length} dead=${dead.length} axe=${axe.map((a) => `${a.id}x${a.nodes}`).join(",") || "0"} focus=${focus.ok ? "ok" : focus.what}`,
  );
}

const browser = await chromium.launch({ channel: "chrome", headless: true });

// Guest setup once: a CONFIRMED booking for the confirmation screen, and one hold for the pay
// screen (both widths reuse them).
let confirmed = null;
let payPath = null;
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, "/login", "asha@guest.example");
  await page.goto(base + "/account", { waitUntil: "networkidle" });
  const refs = await page
    .locator('a[href^="/booking/CA-"]')
    .evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
  for (const href of refs) {
    await page.goto(base + href, { waitUntil: "networkidle" });
    if (await page.getByRole("heading", { name: "Your stay is confirmed" }).count()) {
      confirmed = href;
      break;
    }
  }
  const details = await cartDetails(page);
  await page.goto(base + details);
  await page.getByRole("button", { name: "Hold my rooms" }).click();
  await page.waitForURL(/\/book\/pay\/CA-/, { timeout: 90_000 });
  payPath = new URL(page.url()).pathname;
  await ctx.close();
}

for (const width of WIDTHS) {
  // Signed out.
  {
    const ctx = await browser.newContext({ viewport: width });
    const page = await ctx.newPage();
    const details = await cartDetails(page);
    for (const [screen, path] of [
      ["home", "/"],
      ["rooms", search],
      ["room-detail", "/rooms/garden-villa"],
      ["details-signup", details],
      ["enquire", "/enquire"],
      ["login", "/login"],
      ["signup", "/signup"],
      ["staff-login", "/admin/login"],
    ])
      await check(page, "signed-out", screen, path, width);
    await ctx.close();
  }
  // Guest.
  {
    const ctx = await browser.newContext({ viewport: width });
    const page = await ctx.newPage();
    await login(page, "/login", "asha@guest.example");
    const details = await cartDetails(page);
    await check(page, "guest", "details", details, width);
    await check(page, "guest", "account", "/account", width);
    if (confirmed) await check(page, "guest", "confirmation", confirmed, width);
    if (payPath) await check(page, "guest", "pay", payPath, width);
    await ctx.close();
  }
  // Staff roles.
  for (const role of ["reservations", "sales", "gm"]) {
    const ctx = await browser.newContext({ viewport: width });
    const page = await ctx.newPage();
    await login(page, "/admin/login", `${role}@companya.example`, "Work email");
    await page.goto(base + "/admin/inbox", { waitUntil: "networkidle" });
    const enquiry = await page
      .locator('a[href^="/admin/inbox/ENQ-"]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    for (const [screen, path] of [
      ["overview", "/admin"],
      ["rates", "/admin/rates"],
      ["allotment", "/admin/allotment"],
      ["promos", "/admin/promos"],
      ["bookings", "/admin/bookings"],
      ["inbox", "/admin/inbox"],
      ...(enquiry ? [["enquiry-detail", enquiry.split("?")[0]]] : []),
      ["outbox", "/dev/outbox"],
    ])
      await check(page, role, `${role}-${screen}`, path, width);
    await ctx.close();
  }
}
await browser.close();
writeFileSync(
  `${outDir}/walk.json`,
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2) + "\n",
);
const bad = results.filter(
  (r) =>
    r.status >= 500 ||
    r.overflowPx > 0 ||
    r.consoleErrors.length ||
    r.deadLinks.length ||
    r.axe.length ||
    !r.focus.ok,
);
console.log(`\n${results.length} checks, ${bad.length} with findings`);
