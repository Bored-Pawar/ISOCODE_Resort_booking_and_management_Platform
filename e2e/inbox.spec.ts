import { expect, test } from "@playwright/test";

test.skip(!process.env.E2E_BASE_URL, "Set E2E_BASE_URL to run the end to end inbox test");

/**
 * H1 second path (Q6). Needs the demo seed (`pnpm db:seed`, ENQ-4411 not yet replied) and
 * DEV_TOOLS_ENABLED=true for the outbox check. Nothing is emailed or messaged.
 */
test("staff signs in, opens ENQ-4411, edits the draft, approves and sends, sees it replied and in the outbox", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("Work email").fill("reservations@companya.example");
  await page.getByRole("textbox", { name: "Password" }).fill("Demo@12345");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/inbox?lane=room");
  await page
    .getByRole("link", { name: /Rohit Shetty.*ENQ-4411/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/admin\/inbox\/ENQ-4411/);
  const detail = page.getByRole("region", { name: "Enquiry detail" });
  await expect(detail.getByRole("blockquote")).toContainText("Is a villa free 14-16 Nov");

  // The seed has no draft rows: generate one from the saved details (prices from the rate table).
  const generate = detail.getByRole("button", { name: "Generate draft" });
  if (await generate.isVisible()) await generate.click();
  const reply = detail.getByRole("textbox", { name: "Reply" });
  await expect(reply).toBeVisible({ timeout: 60_000 });

  await reply.fill(`${await reply.inputValue()}\n\nWe look forward to welcoming you.`);
  await detail.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();

  await detail.getByRole("button", { name: "Approve and send" }).click();
  const dialog = page.getByRole("dialog", { name: "Send this reply?" });
  await expect(dialog).toContainText("WhatsApp");
  await expect(dialog).toContainText("We look forward to welcoming you.");
  await dialog.getByRole("button", { name: "Approve and send" }).click();

  await expect(detail.getByRole("heading", { name: "Reply sent" })).toBeVisible();
  await expect(detail.getByText("Replied", { exact: true })).toBeVisible();
  await expect(detail.getByText(/approved and sent the reply/i)).toBeVisible();

  await page.goto("/dev/outbox?tab=replies");
  const sent = page.getByRole("listitem").filter({ hasText: "ENQ-4411" });
  await expect(sent).toContainText("We look forward to welcoming you.");
  await expect(sent).toContainText("WhatsApp");
});
