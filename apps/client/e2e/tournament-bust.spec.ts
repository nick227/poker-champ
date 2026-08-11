import { test, expect } from "./test";

const DEALING_NEXT_HAND = /dealing next hand/i;
const GOTO_OPTS = { waitUntil: "domcontentloaded" as const, timeout: 90_000 };

test.describe("tournament bust UX (E1)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("eliminated player sees strip and freezeout banner, not dealing-next-hand", async ({
    page,
  }) => {
    await page.goto("/dev/tournament-bust-e2e?fixture=eliminated", GOTO_OPTS);
    await expect(page.locator("#root")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("tournament-bust-fixture-eliminated")).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByTestId("table-status-strip-text")).toContainText(
      "YOU WERE ELIMINATED",
      { timeout: 15_000 },
    );
    await expect(page.getByText(DEALING_NEXT_HAND)).toHaveCount(0);
    await expect(page.getByTestId("table-status-strip-spinner")).toHaveCount(0);
  });

  test("winner sees tournament complete strip and champion banner", async ({ page }) => {
    await page.goto("/dev/tournament-bust-e2e?fixture=winner", GOTO_OPTS);
    await expect(page.locator("#root")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("tournament-bust-fixture-winner")).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByTestId("table-status-strip-text")).toContainText(
      "TOURNAMENT COMPLETE",
      { timeout: 15_000 },
    );
    await expect(page.getByText("CHAMPION")).toBeVisible();
    await expect(page.getByText(DEALING_NEXT_HAND)).toHaveCount(0);
    await expect(page.getByTestId("table-status-strip-spinner")).toHaveCount(0);
  });
});
