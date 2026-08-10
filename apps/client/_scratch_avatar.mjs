import { chromium } from "playwright-core";
const OUT = "/tmp/claude-1000/-home-administrator-web-poker-champ/1568e666-5c17-45cc-8865-381be42c10b7/scratchpad";
const browser = await chromium.launch({ args: ["--no-sandbox"], headless: true });

// desktop default 6-max
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:8081/dev/table-redesign?maxSeats=6&occupied=5&heroSeat=0", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  // find an opponent seat pod bounding box via DOM text search - just crop a region we saw cards in top area
  await page.screenshot({ path: `${OUT}/avatar_desktop_full.png` });
  await browser.close();
}
