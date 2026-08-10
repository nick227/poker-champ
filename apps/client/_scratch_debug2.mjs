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
  let el = dex;
  const chain = [];
  for (let i=0;i<10 && el; i++) {
    const cs = getComputedStyle(el);
    chain.push({
      tag: el.tagName,
      cls: el.className && el.className.toString().slice(0,60),
      rect: el.getBoundingClientRect(),
      position: cs.position,
      top: cs.top, height: cs.height, overflow: cs.overflow,
    });
    el = el.parentElement;
  }
  return chain;
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
