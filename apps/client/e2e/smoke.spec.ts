import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("loads app root", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#root")).toBeVisible({ timeout: 15_000 });
  });

  test("lobby page loads", async ({ page }) => {
    await page.goto("/lobby");
    await expect(page.locator("#root")).toBeVisible({ timeout: 15_000 });
  });
});
