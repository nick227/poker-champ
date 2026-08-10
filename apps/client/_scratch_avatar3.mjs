import { chromium } from "playwright-core";
const OUT = "/tmp/claude-1000/-home-administrator-web-poker-champ/1568e666-5c17-45cc-8865-381be42c10b7/scratchpad";
const browser = await chromium.launch({ args: ["--no-sandbox"], headless: true });

async function inspect(vp, tag) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto("http://localhost:8081/dev/table-redesign?maxSeats=6&occupied=5&heroSeat=0", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    function findByText(txt) {
      const all = document.querySelectorAll("*");
      for (const el of all) {
        if (el.children.length === 0 && el.textContent && el.textContent.trim() === txt) return el;
      }
      return null;
    }
    const nameEl = findByText("Osyaac773");
    let el = nameEl;
    for (let i=0;i<3;i++) el = el.parentElement; // -> bodyView (SeatPlate outer View)
    const bodyRect = el.getBoundingClientRect();
    const bodyStyle = el.getAttribute('style');
    const kids = Array.from(el.children).map(k => ({
      rect: k.getBoundingClientRect(),
      style: k.getAttribute('style'),
    }));
    return { bodyRect, bodyStyle, kids };
  });
  console.log(tag, JSON.stringify(info, null, 1));
  await page.close();
}
await inspect({width:1440,height:900}, "desktop");
await browser.close();
