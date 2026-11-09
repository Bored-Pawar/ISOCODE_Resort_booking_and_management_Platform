// H3 measurement: first-load JS (gzip) per page and Lighthouse mobile (simulated Slow 4G) LCP.
// Usage: pnpm build && pnpm start -p 3200, then
//   node scripts/perf-h3.mjs http://localhost:3200 docs/perf/raw-<label>.json
// Signs in as the seeded guest (development database) to reach /book/details. Read only apart
// from the sign in; nothing is held or booked.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3200";
const out = process.argv[3] ?? "docs/perf/raw.json";

function istDate(days) {
  return new Date(Date.now() + 5.5 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
}
const checkIn = istDate(21);
const checkOut = istDate(23);
const search = `/rooms?checkIn=${checkIn}&checkOut=${checkOut}&adults=2&children=0`;

// 1. Sign in and build a stay to get a real /book/details URL and the session cookie.
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`${base}/login`);
await page.getByRole("textbox", { name: "Email" }).fill("asha@guest.example");
await page.getByRole("textbox", { name: "Password" }).fill("Demo@12345");
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL(/\/account/);
await page.goto(`${base}${search}`, { waitUntil: "networkidle" });
await page
  .getByRole("article")
  .filter({ hasText: "Plantation Room" })
  .getByRole("button", { name: "Add room" })
  .click();
await page.getByRole("button", { name: "Continue" }).first().click();
await page.waitForURL(/\/book\/details\?.*quoteHash=/);
const details = new URL(page.url()).pathname + new URL(page.url()).search;
const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
await browser.close();

const pages = [
  { name: "home", path: "/" },
  { name: "rooms-search", path: search },
  { name: "room-detail", path: "/rooms/garden-villa" },
  { name: "book-details", path: details, auth: true },
  { name: "enquire", path: "/enquire" },
];

// 2. First-load JS: every <script src> in the HTML except noModule, gzip level 9 (close to what
// Vercel serves with brotli/gzip).
async function get(url, init) {
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, {
        ...init,
        headers: { ...(init?.headers ?? {}), connection: "close" },
      });
    } catch (e) {
      if (i >= 3) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}
async function jsKb(path, auth) {
  const html = await (await get(base + path, { headers: auth ? { cookie } : {} })).text();
  const srcs = [...html.matchAll(/<script([^>]*)src="([^"]+)"([^>]*)>/g)]
    .filter((m) => !/nomodule/i.test(m[1] + m[3]))
    .map((m) => m[2]);
  let total = 0;
  for (const src of new Set(srcs)) {
    const buf = Buffer.from(await (await get(new URL(src, base))).arrayBuffer());
    total += gzipSync(buf, { level: 9 }).length;
  }
  return { scripts: new Set(srcs).size, gzipKb: Math.round((total / 1024) * 10) / 10 };
}

// 3. Lighthouse mobile, default simulated throttling (Slow 4G, 4x CPU). Median of 3 runs.
function lighthouse(path, auth) {
  const dir = join(tmpdir(), `lh-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const file = join(dir, `${i}.json`);
    // shell: true (pnpm is a .cmd on Windows): quote the URL (it has &) and pass headers by file.
    const args = [
      "dlx",
      "lighthouse@13.6.0",
      `"${base + path}"`,
      "--only-categories=performance",
      "--form-factor=mobile",
      "--throttling-method=simulate",
      "--output=json",
      `--output-path="${file}"`,
      "--quiet",
      "--chrome-flags=--headless=new",
    ];
    if (auth) {
      const headers = join(dir, "headers.json");
      writeFileSync(headers, JSON.stringify({ Cookie: cookie }));
      args.push(`--extra-headers="${headers}"`);
    }
    execFileSync("pnpm", args, { stdio: "ignore", shell: true, timeout: 240_000, cwd: tmpdir() });
    const r = JSON.parse(readFileSync(file, "utf8"));
    runs.push({
      score: Math.round(r.categories.performance.score * 100),
      lcpMs: Math.round(r.audits["largest-contentful-paint"].numericValue),
      fcpMs: Math.round(r.audits["first-contentful-paint"].numericValue),
      tbtMs: Math.round(r.audits["total-blocking-time"].numericValue),
      cls: Math.round(r.audits["cumulative-layout-shift"].numericValue * 1000) / 1000,
      lcpElement:
        r.audits["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node
          ?.snippet ?? null,
    });
  }
  rmSync(dir, { recursive: true, force: true });
  runs.sort((a, b) => a.lcpMs - b.lcpMs);
  return { median: runs[1], runs };
}

const results = [];
for (const p of pages) {
  const js = await jsKb(p.path, p.auth);
  const lh = lighthouse(p.path, p.auth);
  results.push({
    page: p.name,
    path: p.name === "book-details" ? "/book/details?…" : p.path,
    js,
    lighthouse: lh,
  });
  console.log(p.name, js.gzipKb, "KB", "LCP", lh.median.lcpMs, "ms", "score", lh.median.score);
}
mkdirSync("docs/perf", { recursive: true });
writeFileSync(
  out,
  JSON.stringify({ measuredAt: new Date().toISOString(), base, results }, null, 2) + "\n",
);
