import { defineConfig } from "@playwright/test";

/**
 * H1 end to end happy path. Runs against an already running app (`pnpm dev` on the development
 * database): set E2E_BASE_URL, e.g. http://localhost:3000. Without it every test is skipped.
 * Uses the installed Chrome (channel "chrome"), so no browser download is needed.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 300_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
});
