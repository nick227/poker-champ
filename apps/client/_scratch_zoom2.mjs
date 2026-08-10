import { chromium } from "playwright-core";
const OUT = "/tmp/claude-1000/-home-administrator-web-poker-champ/1568e666-5c17-45cc-8865-381be42c10b7/scratchpad";
const browser = await chromium.launch({ args: ["--no-sandbox"], headless: true });

async function shot(url, vp, clip, name) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png`, clip });
  await page.close();
}

await shot("http://localhost:8081/dev/table-redesign?maxSeats=2&occupied=1&heroSeat=0", {width:1440,height:900}, {x:600,y:0,width:280,height:220}, "hu_desktop_top");
await shot("http://localhost:8081/dev/table-redesign?maxSeats=2&occupied=1&heroSeat=0", {width:390,height:844}, {x:120,y:100,width:200,height:220}, "hu_mobile_top");
await shot("http://localhost:8081/dev/table-redesign?maxSeats=9&occupied=8&heroSeat=0", {width:1440,height:900}, {x:180,y:680,width:280,height:180}, "9max_desktop_dex0");

await browser.close();
