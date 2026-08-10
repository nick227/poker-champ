import { chromium } from "playwright-core";
const browser = await chromium.launch({ args: ["--no-sandbox"], headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:8081/dev/table-redesign?maxSeats=9&occupied=8&heroSeat=0", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const info = await page.evaluate(() => {
  function findByText(txt) {
    const all = document.querySelectorAll("*");
    for (const el of all) {
      if (el.children.length === 0 && el.textContent && el.textContent.trim() === txt) {
        return el;
      }
    }
    return null;
  }
  const dex = findByText("Dex_0");
  const actionBar = document.querySelector('[class*="actionHudSection"], [data-testid], div');
  const results = {};
  if (dex) {
    let el = dex;
    // climb up to find the pod container - go up a few levels
    for (let i=0;i<8;i++) {
      if (!el.parentElement) break;
      el = el.parentElement;
    }
    results.dexRect = el.getBoundingClientRect();
    results.dexTextRect = dex.getBoundingClientRect();
  }
  // Find MIN button (action bar) top
  const minBtn = findByText("MIN");
  if (minBtn) {
    let el = minBtn;
    for (let i=0;i<6;i++) { if(!el.parentElement) break; el = el.parentElement; }
    results.actionBarRect = el.getBoundingClientRect();
  }
  results.bodyH = document.body.getBoundingClientRect();
  return results;
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
