/**
 * YuanFen demo recorder — drives the golden path and records video.
 * Run from wt-demo:  node <this file>
 * Output: ./recordings/ (override with RECORD_OUT)
 */
import { chromium } from "playwright";
import { mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.env.RECORD_OUT ?? join(process.cwd(), "recordings");
const URL = "http://localhost:5173";
const W = 1600, H = 900;

mkdirSync(OUT, { recursive: true });

const beat = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`  ${m}`);

let t0 = 0;
const marks = [];
const clock = () => {
  const ms = Date.now() - t0;
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

async function step(name, fn) {
  const at = clock();
  process.stdout.write(`[${at}] ${name} ... `);
  try {
    await fn();
    marks.push(`${at}  ${name}`);
    console.log("ok");
  } catch (e) {
    console.log(`FAILED — ${e.message.split("\n")[0]}`);
    throw e;
  }
}

const browser = await chromium.launch({
  headless: false,
  channel: "chrome", // use system Chrome — cached playwright chromium is version-stale
  args: ["--force-device-scale-factor=1", "--hide-scrollbars"],
});
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: W, height: H } },
});
const page = await ctx.newPage();
t0 = Date.now(); // video recording clock starts here

try {
  await step("load", async () => {
    await page.goto(URL, { waitUntil: "networkidle" });
    await page.waitForSelector(".vibe-chip", { timeout: 15000 });
    await beat(2500); // let the reveal animations land before we touch anything
  });

  // ---- S0: taste ----------------------------------------------------------
  await step("vibes", async () => {
    const picks = ["Food-led", "Café slow", "Culture", "Big views", "Unhurried"];
    for (const label of picks) {
      await page.locator(".vibe-chip", { hasText: label }).first().click();
      await beat(650);
    }
    await beat(1200);
    await page.locator("button.cta").click();
  });

  await step("swipe deck (15)", async () => {
    await page.waitForSelector(".deck-area .swipe-card.live", { timeout: 15000 });
    // Warm every deck photo into the browser cache so none pops in on camera.
    await page.evaluate(async () => {
      const res = await fetch("/api/taste/deck");
      const { cards } = await res.json();
      await Promise.all(
        cards
          .filter((c) => c.photoUrl)
          .map(
            (c) =>
              new Promise((done) => {
                const img = new Image();
                img.onload = img.onerror = () => done();
                img.src = c.photoUrl;
              }),
          ),
      );
    });
    await beat(1800);
    // A human-ish mix: mostly keeps, a few must-gos, a couple passes.
    const script = [
      "like", "must", "pass", "like", "like",
      "must", "like", "pass", "like", "must",
      "like", "like", "pass", "like", "must",
    ];
    const sel = { like: ".act-like", pass: ".act-pass", must: ".act-must" };
    for (let i = 0; i < script.length; i++) {
      const done = await page.locator(".deck-actions").count();
      if (!done) break;
      await page.locator(sel[script[i]]).click();
      await beat(760); // 320ms leave animation + time to actually see the photo
    }
  });

  // ---- S1: chat -> route --------------------------------------------------
  await step("S1 chat", async () => {
    await page.waitForSelector(".composer-bar input", { timeout: 15000 });
    await beat(2200);
    const input = page.locator(".composer-bar input");
    await input.click();
    await input.pressSequentially(
      "ArtScience Museum, must eat chicken rice, then somewhere quiet",
      { delay: 42 },
    );
    await beat(900);
    await page.locator('.composer-bar button[type="submit"]').click();
    await page.waitForSelector(".route-card", { timeout: 20000 });
    await beat(3800); // hold on the route + map
  });

  await step("S1 alternatives", async () => {
    for (let i = 0; i < 2; i++) {
      await page.locator('[aria-label="Next take"]').click();
      await beat(2600);
    }
  });

  await step("S1 reveal sealed stop", async () => {
    const sealed = page.locator("li.stop.sealed").first();
    if (await sealed.count()) {
      await sealed.click();
      await beat(3200);
    } else {
      log("no sealed stop in this take — skipping");
    }
  });

  // ---- S3: unprompted alert ----------------------------------------------
  await step("S3 alert", async () => {
    await page.waitForSelector(".alert-slip", { timeout: 20000 });
    await beat(3000); // let it sit on screen, unprompted — this is the beat
    await page.locator(".alert-slip").click();
    await page.waitForSelector(".hand-sheet", { timeout: 10000 });
    await beat(3600);
  });

  await step("S3 break the seal", async () => {
    await page.locator(".wildcard-sealed").click();
    await beat(3400);
  });

  // ---- S4: expand -> trip -> flight swap ----------------------------------
  await step("expand deal -> trip", async () => {
    await page.locator(".deal-card").first().click();
    await page.waitForSelector(".trip-panel", { timeout: 20000 });
    await beat(4000);
  });

  await step("S4 flight swap + reflow", async () => {
    const alt = page.locator(".flight-row:not(.active) .flight-main").first();
    await alt.scrollIntoViewIfNeeded();
    await beat(1200);
    await alt.click();
    await beat(5200); // reflow cascade + budget delta + narration line
  });

  await step("S4 hold on delta", async () => {
    await beat(3000);
  });

  // ---- booking checkpoint --------------------------------------------------
  await step("booking", async () => {
    await page.locator(".book-btn").first().click();
    await page.waitForSelector(".booking-sheet", { timeout: 15000 });
    await beat(2600); // "Re-verifying the offer price…"
    await page.waitForSelector("text=Create test order", { timeout: 20000 });
    await beat(2400);
    await page.locator("button.cta", { hasText: "Create test order" }).click();
    await page.waitForSelector(".masked-summary", { timeout: 20000 });
    await beat(4000); // read the masked summary
    await page.locator("button.cta.consent").click();
    await page.waitForSelector(".ticket", { timeout: 25000 });
    await beat(4500); // order / PNR / ticket on screen
    await page.locator("button.cta", { hasText: "Done" }).click();
    await beat(1500);
  });

  // ---- receipts ------------------------------------------------------------
  await step("receipts", async () => {
    await page.locator(".evidence-toggle").click();
    await page.waitForSelector(".evidence-panel", { timeout: 10000 });
    await beat(5000);
  });

  await beat(1500);
  console.log("\nWALK COMPLETE");
} catch (e) {
  console.log("\nWALK ABORTED — video still saved up to this point");
  console.log(e.message);
  process.exitCode = 1;
} finally {
  const vid = page.video();
  await ctx.close();
  await browser.close();
  if (vid) {
    const p = await vid.path();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dest = join(OUT, `yuanfen-raw-${stamp}.webm`);
    renameSync(p, dest);
    writeFileSync(
      join(OUT, `yuanfen-raw-${stamp}.beats.txt`),
      `beat sheet — ${dest}\n(times are from the start of the recording)\n\n${marks.join("\n")}\n`,
    );
    console.log(`video: ${dest}`);
    console.log(`beats: ${dest.replace(/\.webm$/, ".beats.txt")}`);
  }
  console.log(`dir:   ${OUT}`);
  console.log(readdirSync(OUT).join("\n"));
}
