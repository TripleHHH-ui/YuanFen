/** Render the S1 route screen in candidate palettes so they can be compared. */
import { chromium } from "playwright";

const OUT = process.env.SHOT_OUT ?? ".";
const beat = (ms) => new Promise((r) => setTimeout(r, ms));

const PALETTES = {
  "a-current": "",
  "b-celadon": `:root{
    --paper:#e9efe9; --paper-2:#dde6dd; --card:#f3f7f2;
    --ink:#1b2420; --ink-soft:#54615b;
    --line:rgba(27,36,32,.15);
    --thread:#c8372d; --thread-deep:#9d2a21;
    --jade:#2f6b56; --gold:#b8912a;
  }
  .app-shell.paper{background:
    radial-gradient(1200px 500px at 85% -10%, rgba(200,55,45,.06), transparent 60%),
    radial-gradient(900px 500px at -10% 110%, rgba(47,107,86,.12), transparent 60%),
    var(--paper) !important;}`,
  "c-deep-jade": `:root{
    --paper:#0f1f1a; --paper-2:#162a24; --card:#172d26;
    --ink:#e8e4d8; --ink-soft:#93a49c;
    --line:rgba(232,228,216,.17);
    --thread:#e2564a; --thread-deep:#b83c31;
    --jade:#57a184; --gold:#d4a63c;
    --shadow:0 18px 50px -18px rgba(0,0,0,.6);
  }
  .app-shell.paper{background:
    radial-gradient(1200px 500px at 85% -10%, rgba(226,86,74,.10), transparent 60%),
    radial-gradient(900px 500px at -10% 110%, rgba(87,161,132,.12), transparent 60%),
    var(--paper) !important;}
  /* light raster tiles need flipping to sit on a dark ground */
  .maplibregl-canvas{filter:invert(1) hue-rotate(180deg) saturate(.55) brightness(.92)}`,
};

const browser = await chromium.launch({ headless: false, channel: "chrome" });

for (const [name, css] of Object.entries(PALETTES)) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  if (css) await page.addStyleTag({ content: css });

  await page.waitForSelector(".vibe-chip");
  for (const l of ["Food-led", "Café slow", "Culture", "Big views", "Unhurried"]) {
    await page.locator(".vibe-chip", { hasText: l }).first().click();
  }
  await page.locator("button.cta").click();
  await page.waitForSelector(".swipe-card.live");
  if (css) await page.addStyleTag({ content: css });
  await beat(1600);
  await page.screenshot({ path: `${OUT}/pal-${name}-deck.png` });

  for (let i = 0; i < 15; i++) {
    if (!(await page.locator(".deck-actions").count())) break;
    await page.locator(".act-like").click();
    await beat(360);
  }
  await page.waitForSelector(".composer-bar input", { timeout: 15000 });
  if (css) await page.addStyleTag({ content: css });
  await page.locator(".composer-bar input").fill("Day trip in Singapore CBD, must eat chicken rice, then somewhere quiet");
  await page.locator('.composer-bar button[type="submit"]').click();
  await page.waitForSelector(".route-card", { timeout: 20000 });
  await beat(5200); // let the map tiles settle
  await page.screenshot({ path: `${OUT}/pal-${name}-route.png` });
  console.log(`captured ${name}`);
  await page.close();
}
await browser.close();
