/** Walk to the S1 route and report basemap tile health + a screenshot. */
import { chromium } from "playwright";

const OUT = process.env.SHOT_OUT ?? ".";
const beat = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: false, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const tiles = { ok: 0, failed: [], zooms: new Map() };
page.on("response", (res) => {
  const u = res.url();
  if (!u.includes("tile.openstreetmap.org")) return;
  const z = u.split("/").slice(-3)[0];
  if (res.ok()) {
    tiles.ok += 1;
    tiles.zooms.set(z, (tiles.zooms.get(z) ?? 0) + 1);
  } else {
    tiles.failed.push(`z${z} -> ${res.status()}`);
  }
});

await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.waitForSelector(".vibe-chip");
for (const l of ["Food-led", "Café slow", "Culture", "Big views", "Unhurried"]) {
  await page.locator(".vibe-chip", { hasText: l }).first().click();
}
await page.locator("button.cta").click();
await page.waitForSelector(".swipe-card.live");
for (let i = 0; i < 15; i++) {
  if (!(await page.locator(".deck-actions").count())) break;
  await page.locator(".act-like").click();
  await beat(380);
}
await page.waitForSelector(".composer-bar input", { timeout: 15000 });
await page.locator(".composer-bar input").fill("ArtScience Museum, must eat chicken rice, then somewhere quiet");
await page.locator('.composer-bar button[type="submit"]').click();
await page.waitForSelector(".route-card", { timeout: 20000 });
await beat(5000); // let tiles settle

await page.screenshot({ path: `${OUT}/map-check.png` });
await browser.close();

const zs = [...tiles.zooms.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
console.log(`tiles ok: ${tiles.ok}`);
console.log(`tiles by zoom: ${zs.map(([z, n]) => `z${z}:${n}`).join("  ")}`);
console.log(`tiles failed: ${tiles.failed.length}`);
tiles.failed.slice(0, 8).forEach((f) => console.log("  " + f));
