import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/tmp/claude-1000/-home-administrator-web-poker-champ/1568e666-5c17-45cc-8865-381be42c10b7/scratchpad";
fs.mkdirSync(OUT, { recursive: true });

const configs = [
  { maxSeats: 2, occupied: 1, tag: "hu" },
  { maxSeats: 3, occupied: 2, tag: "3way" },
  { maxSeats: 6, occupied: 2, tag: "6sparse" },
  { maxSeats: 6, occupied: 5, tag: "6default" },
  { maxSeats: 9, occupied: 8, tag: "9max" },
];
const viewports = [
  { width: 390, height: 844, tag: "mobile" },
  { width: 1440, height: 900, tag: "desktop" },
];

const browser = await chromium.launch({ args: ["--no-sandbox"], headless: true });
for (const cfg of configs) {
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const url = `http://localhost:8081/dev/table-redesign?maxSeats=${cfg.maxSeats}&occupied=${cfg.occupied}&heroSeat=0`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const path = `${OUT}/${cfg.tag}_${vp.tag}.png`;
    await page.screenshot({ path, fullPage: false });
    console.log("saved", path);
    await page.close();
  }
}
await browser.close();
