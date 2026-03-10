import { test, expect } from "./test";

const HEIGHT_TOLERANCE_PX = 2;

test.describe("table layout", () => {
  test("hero and opponent strip heights stable on viewport resize (no jump)", async ({
    page,
    context,
  }) => {
    await page.goto("/table/e2e-layout-test");
    await page.waitForLoadState("networkidle").catch(() => {});

    const heroSection = page.locator(".table-hero-section").first();
    const opponentStrip = page.locator(".table-opponent-strip").first();

    const hasTable = (await heroSection.count()) > 0 && (await opponentStrip.count()) > 0;
    if (!hasTable) {
      test.skip();
      return;
    }

    const viewport = await page.viewportSize() ?? { width: 400, height: 800 };
    const smallHeight = 600;
    const largeHeight = 900;

    await page.setViewportSize({ width: viewport.width, height: largeHeight });
    await page.waitForTimeout(300);
    const heroRectLarge = await heroSection.boundingBox();
    const stripRectLarge = await opponentStrip.boundingBox();

    await page.setViewportSize({ width: viewport.width, height: smallHeight });
    await page.waitForTimeout(500);
    const heroRectSmall = await heroSection.boundingBox();
    const stripRectSmall = await opponentStrip.boundingBox();

    if (heroRectLarge && heroRectSmall) {
      const heroDiff = Math.abs(heroRectLarge.height - heroRectSmall.height);
      expect(heroDiff).toBeLessThanOrEqual(HEIGHT_TOLERANCE_PX);
    }
    if (stripRectLarge && stripRectSmall) {
      const stripDiff = Math.abs(stripRectLarge.height - stripRectSmall.height);
      expect(stripDiff).toBeLessThanOrEqual(HEIGHT_TOLERANCE_PX);
    }
  });
});
