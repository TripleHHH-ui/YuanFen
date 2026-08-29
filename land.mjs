import { chromium } from "playwright";
const OUT = process.env.SHOTS || ".";
const errs = [];
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => errs.push(e.message));
page.on("response", (r) => { if (r.status() >= 400) errs.push(r.status() + " " + r.url()); });

await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
const chips = page.locator("button.vibe-chip");
for (let i = 0; i < 5; i++) await chips.nth(i).click();
await page.locator("button.cta").first().click();
await page.waitForTimeout(1500);
for (let i = 0; i < 20; i++) {
  const like = page.locator("button", { hasText: "♥" }).first();
  if (!(await like.count())) break;
  try { await like.click({ timeout: 2000 }); } catch { break; }
  await page.waitForTimeout(420);
}
await page.waitForTimeout(5000);
await page.screenshot({ path: `${OUT}/land-home.png` });

console.log("example prompt chips:", await page.locator(".example-chip").count());
console.log("nearby panel:", await page.locator(".nearby-panel").count());
console.log("recommendation pins:", await page.locator(".pin-rec").count());

const chip = page.locator(".example-chip").first();
if (await chip.count()) {
  console.log("first example:", (await chip.innerText()).replace(/\n/g, " "));
  await chip.click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/land-after-example.png` });
  const t = await page.locator("body").innerText();
  console.log("route rendered:", /take \d\/\d/i.test(t));
}
console.log("errors:", errs.length);
for (const e of errs.slice(0, 5)) console.log("  !", e.slice(0, 140));
await browser.close();
