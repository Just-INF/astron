import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const path of [
  "/",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/privacy",
  "/terms",
  "/cookies",
]) {
  test(`${path} renders without serious accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("body")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(700);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(
      results.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);
  });
}

test("forgot-password flow accepts a valid address", async ({ page }) => {
  await page.route("**/api/auth/forgot-password", (route) =>
    route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ data: { accepted: true } }),
    }),
  );
  await page.goto("/auth/forgot-password");
  await page.getByLabel("Work email").fill("owner@example.com");
  await page.getByRole("button", { name: /prepare recovery link/i }).click();
  await expect(page.getByText("Check your inbox.")).toBeVisible();
});

test("landing page stays usable at a narrow mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Run every service with clarity." })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});
