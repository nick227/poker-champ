import { chromium } from "playwright-core";
const OUT = "/tmp/claude-1000/-home-administrator-web-poker-champ/1568e666-5c17-45cc-8865-381be42c10b7/scratchpad";
const browser = await chromium.launch({ args: ["--no-sandbox"], headless: true });

async function inspect(vp, tag) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto("http://localhost:8081/dev/table-redesign?maxSeats=6&occupied=5&heroSeat=0", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    // Osyaac773 is the north opponent seat - find its avatar disc (has data-avatar-hue attribute)
    const discs = Array.from(document.querySelectorAll('[data-avatar-hue]'));
    // north seat is topmost (smallest y)
    discs.sort((a,b)=>a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const northDisc = discs[0];
    const discRect = northDisc.getBoundingClientRect();
    // find nearest ancestor "pod" (SeatPlate body view) - climb until we find one containing name text sibling structure; simplest: get pod bounding box via avatar's ancestor chain, and separately find card element.
    // Cards: find element with backgroundColor white-ish card faces near top - instead locate by class heuristic: search siblings of the avatar's grandparent for an element positioned above discRect.top
    let el = northDisc;
    for (let i=0;i<4;i++) el = el.parentElement; // climb to seat plate "body" View roughly
    const bodyRect = el.getBoundingClientRect();
    return { discRect, bodyRect };
  });
  await page.screenshot({ path: `${OUT}/pod_${tag}.png`, clip: { x: Math.max(0, info.bodyRect.x-20), y: Math.max(0, info.bodyRect.y-70), width: info.bodyRect.width+40, height: info.bodyRect.height+120 } });
  console.log(tag, JSON.stringify(info));
  await page.close();
}
await inspect({width:1440,height:900}, "desktop");
await inspect({width:390,height:844}, "mobile");
await browser.close();
