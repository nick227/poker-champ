import { chromium } from "playwright-core";
const browser = await chromium.launch({ args: ["--no-sandbox"], headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
  for (let i=0;i<3;i++) el = el.parentElement; // bodyView
  const cardsContainer = el.children[0];
  const avatarCol = el.children[1];
  // avatar disc = first descendant with borderRadius = 50%
  function deepestLeafRects(node, depth=0, acc=[]) {
    acc.push({depth, tag: node.tagName, rect: node.getBoundingClientRect(), style: (node.getAttribute('style')||'').slice(0,150)});
    for (const c of node.children) deepestLeafRects(c, depth+1, acc);
    return acc;
  }
  const cardsTree = deepestLeafRects(cardsContainer);
  const avatarTree = deepestLeafRects(avatarCol).slice(0,6);
  return { cardsTree, avatarTree };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
