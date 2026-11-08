import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test.skip(!process.env.E2E_BASE_URL, "Set E2E_BASE_URL to run the end to end booking test");

/** An IST date `days` from now, inside the 3 month online window. */
function istDate(days: number): string {
  const d = new Date(Date.now() + 5.5 * 3_600_000 + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

test("guest searches, builds a stay, signs up inline, holds, pays and sees the confirmation", async ({
  page,
}) => {
  const checkIn = istDate(21);
  const checkOut = istDate(23);

  // Search from home.
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByLabel("Check-in").first().fill(checkIn);
  await page.getByLabel("Check-out").first().fill(checkOut);
  await page.getByRole("button", { name: "Check availability" }).first().click();
  await expect(page).toHaveURL(/\/rooms\?/);

  // Add one Plantation Room (2 adults fit) and continue.
  const card = page.getByRole("article").filter({ hasText: "Plantation Room" });
  await card.getByRole("button", { name: "Add room" }).click();
  const proceed = page.getByRole("button", { name: "Continue" }).first();
  await expect(proceed).toBeEnabled();
  await proceed.click();
  await expect(page).toHaveURL(/\/book\/details\?.*quoteHash=/);

  // Sign up inline (signed out), which returns to this step signed in.
  await page.getByLabel("Full name").fill("E2E Guest");
  await page.getByRole("textbox", { name: "Email" }).fill(`e2e-${randomUUID()}@example.test`);
  await page.getByLabel("Password (8+ characters)", { exact: true }).fill("Demo@12345");
  await page.getByLabel("Confirm password", { exact: true }).fill("Demo@12345");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account and continue" }).click();

  // Hold.
  await page.getByRole("button", { name: "Hold my rooms" }).click();
  await expect(page).toHaveURL(/\/book\/pay\/CA-[0-9A-Z]{5}$/, { timeout: 90_000 });
  const ref = page.url().split("/").pop()!;
  await expect(page.getByRole("timer")).toContainText("Held for you");

  // Pay (default outcome: payment succeeds).
  await page.getByRole("button", { name: /^Pay ₹.*\(test mode\)$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/booking/${ref}$`), { timeout: 90_000 });
  await expect(page.getByRole("heading", { name: "Your stay is confirmed" })).toBeVisible();
  await expect(page.getByText(ref).first()).toBeVisible();
});
