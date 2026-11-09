// H5: the booking flow can start with the keyboard only. Tab to "Add room", Enter, Tab to
// "Continue", Enter, and land on /book/details. Usage: node scripts/keyboard-check.mjs <base>
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3300";
const d = (n) => new Date(Date.now() + 5.5 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
await page.goto(`${base}/rooms?checkIn=${d(21)}&checkOut=${d(23)}&adults=2&children=0`, {
  waitUntil: "networkidle",
  timeout: 180_000,
});
async function tabTo(name, max = 120) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => {
      const el = document.activeElement;
      return (el?.getAttribute("aria-label") || el?.textContent || "").trim();
    });
    if (label.startsWith(name)) return i + 1;
  }
  throw new Error(`could not reach "${name}" with Tab`);
}
const a = await tabTo("Add room");
await page.keyboard.press("Enter");
// The cart lives in the URL; wait until Continue is enabled (focus stays on "Add room").
await page.getByRole("button", { name: "Continue" }).first().waitFor({ state: "visible" });
await page.waitForFunction(
  () =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent?.trim() === "Continue" && !b.disabled,
    ),
  null,
  { timeout: 60_000 },
);
const b = await tabTo("Continue");
await page.keyboard.press("Enter");
await page.waitForURL(/\/book\/details\?.*quoteHash=/, { timeout: 120_000 });
console.log(
  `keyboard ok: Add room after ${a} tabs, Continue after ${b} more, reached /book/details`,
);
await browser.close();
