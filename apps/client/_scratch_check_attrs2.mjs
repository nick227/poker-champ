import { chromium } from "playwright-core";
const browser = await chromium.launch({ args: ["--no-sandbox"], headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:8081/dev/table-redesign?maxSeats=6&occupied=5&heroSeat=0", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const ids = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid]')).map(e=>e.getAttribute('data-testid')));
console.log(ids);
await browser.close();
