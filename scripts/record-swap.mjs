/** Record the isometric trip-graph motion piece. Output: ./recordings/ */
import { chromium } from "playwright";
import { mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";

const OUT = process.env.RECORD_OUT ?? join(process.cwd(), "recordings");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  channel: "chrome",
  args: ["--force-device-scale-factor=1", "--hide-scrollbars"],
});
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: 1600, height: 900 } },
});
const page = await ctx.newPage();

page.on("console", (m) => { if (m.type() === "error") console.log("  console:", m.text()); });
page.on("pageerror", (e) => console.log("  PAGE ERROR:", e.message));

const t0 = Date.now();
await page.goto("http://localhost:5173/swap.html", { waitUntil: "networkidle" });

// The page flips document.title when the timeline finishes.
let done = false;
for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(1000);
  if ((await page.title().catch(() => '')) === 'done') { done = true; break; }
}
if (done) {
  console.log(`timeline finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} else {
  const err = await page.locator("#err").textContent().catch(() => "");
  console.log("timeline did not finish." + (err ? ` page said: ${err.trim()}` : ""));
}
await page.waitForTimeout(1200);

const vid = page.video();
await ctx.close();
await browser.close();
if (vid) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dest = join(OUT, `yuanfen-swap-${stamp}.webm`);
  renameSync(await vid.path(), dest);
  console.log(`video: ${dest}`);
}
