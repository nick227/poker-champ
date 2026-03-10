import { test, expect } from "./test";

/**
 * Flow: Lobby → Enter table → Back to lobby → Enter same table.
 * Asserts: no error banner (no danger toast), only one socket connection.
 * Requires: at least one table in lobby and auth (login) so table join succeeds.
 */
test.describe("lobby → table → lobby → same table", () => {
  test("no error banner and single connection after re-entering same table", async ({
    page,
  }) => {
    await page.goto("/lobby");
    await page.waitForLoadState("networkidle").catch(() => {});

    const firstTableRow = page.locator("[data-table-id]").first();
    try {
      await expect(firstTableRow).toBeVisible({ timeout: 10_000 });
    } catch {
      test.skip(true, "Lobby has no tables (create a game or log in first)");
      return;
    }

    const tableId = await firstTableRow.getAttribute("data-table-id");
    if (!tableId) {
      test.skip();
      return;
    }

    await firstTableRow.getByRole("button", { name: /join/i }).click();
    await page.getByRole("button", { name: /apply/i }).click();

    await expect(page).toHaveURL(new RegExp(`/table/${escapeRegExp(tableId)}`), {
      timeout: 10_000,
    });
    await page
      .locator('[data-e2e-connection-count="1"]')
      .waitFor({ state: "attached", timeout: 15_000 })
      .catch(() => {});

    await page.goto("/lobby");
    await expect(page).toHaveURL(/\/lobby/, { timeout: 5_000 });

    const sameRow = page.locator(`[data-table-id="${tableId}"]`).first();
    await sameRow.getByRole("button", { name: /join/i }).click();
    await page.getByRole("button", { name: /apply/i }).click();

    await expect(page).toHaveURL(new RegExp(`/table/${escapeRegExp(tableId)}`), {
      timeout: 10_000,
    });

    await page.waitForTimeout(1500);

    const dangerToast = page.locator('[data-testid="toast"][data-variant="danger"]');
    await expect(dangerToast).toHaveCount(0);

    const connectionCountEl = page.locator("[data-e2e-connection-count]");
    await expect(connectionCountEl).toHaveAttribute("data-e2e-connection-count", "1");

    await expect(page.locator(".table-hero-section")).toBeVisible();
    await expect(page.locator('[data-testid="hero-stack"]')).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/table\//, { timeout: 10_000 });
    await page.waitForTimeout(2000);

    await expect(page.locator("[data-e2e-connection-count]")).toHaveAttribute(
      "data-e2e-connection-count",
      "1"
    );
    await expect(page.locator('[data-testid="toast"][data-variant="danger"]')).toHaveCount(0);
  });

  test("one hand changes hero stack (Fold/Check/Call)", async ({ page }) => {
    await page.goto("/lobby");
    await page.waitForLoadState("networkidle").catch(() => {});

    const firstTableRow = page.locator("[data-table-id]").first();
    try {
      await expect(firstTableRow).toBeVisible({ timeout: 10_000 });
    } catch {
      test.skip(true, "Lobby has no tables");
      return;
    }

    const tableId = await firstTableRow.getAttribute("data-table-id");
    if (!tableId) {
      test.skip();
      return;
    }

    await firstTableRow.getByRole("button", { name: /join/i }).click();
    await page.getByRole("button", { name: /apply/i }).click();

    await expect(page).toHaveURL(new RegExp(`/table/${escapeRegExp(tableId)}`), {
      timeout: 10_000,
    });
    await page.locator('[data-testid="hero-stack"]').waitFor({ state: "visible", timeout: 15_000 });

    const heroStackEl = page.locator('[data-testid="hero-stack"]');
    const beforeStack = await heroStackEl.textContent();

    const foldBtn = page.getByRole("button", { name: /^fold$/i });
    const checkCallBtn = page.getByRole("button", { name: /check|call/i });
    const actionBtn = (await foldBtn.isVisible()) ? foldBtn : checkCallBtn;
    if (!(await actionBtn.isVisible())) {
      test.skip(true, "No Fold/Check/Call (no active hand or not hero turn)");
      return;
    }

    await actionBtn.click();
    await page.waitForTimeout(4000);

    const afterStack = await heroStackEl.textContent();
    expect(afterStack).not.toBe(beforeStack);
  });
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
