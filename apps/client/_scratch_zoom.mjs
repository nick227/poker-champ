import { chromium } from "playwright-core";
const OUT = "/tmp/claude-1000/-home-administrator-web-poker-champ/1568e666-5c17-45cc-8865-381be42c10b7/scratchpad";
const browser = await chromium.launch({ args: ["--no-sandbox"], headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:8081/dev/table-redesign?maxSeats=9&occupied=8&heroSeat=0", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/9max_mobile_left.png`, clip: { x: 0, y: 300, width: 200, height: 300 } });
await page.screenshot({ path: `${OUT}/9max_mobile_right.png`, clip: { x: 190, y: 200, width: 200, height: 300 } });
await browser.close();
