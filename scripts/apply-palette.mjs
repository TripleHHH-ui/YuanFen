/**
 * Repaint the app and the standalone motion pages into the light celadon
 * palette: cool jade-tinted paper, cinnabar thread, gold seals.
 *
 * Runs value-for-value off whatever palette is currently in the files, so it
 * is safe to re-run. Sentinels avoid collisions where one palette's value is
 * another's (e.g. the old gold and the new gold-deep).
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILES = [
  "apps/web/src/styles.css",
  ...["motion.html", "promo.html", "swap.html", "type.html"].map((f) => `apps/web/public/${f}`),
];

// from -> to, applied via sentinels so no substitution feeds the next
const COLORS = [
  ["#0f1f1a", "#eaf0ea"],   // paper
  ["#162a24", "#dde7dd"],   // paper-2
  ["#172d26", "#f4f8f3"],   // card
  ["#e8e4d8", "#1a231f"],   // ink
  ["#93a49c", "#4f5d57"],   // ink-soft
  ["#e2564a", "#c8372d"],   // thread
  ["#b83c31", "#9d2a21"],   // thread-deep
  ["#57a184", "#2f6b56"],   // jade
  ["#d4a63c", "#b8912a"],   // gold
  ["#b8912a", "#97761f"],   // gold-deep (was set to the new gold's value)
  ["#24382f", "#fdf1ee"],   // "changed" highlight, back to a warm tint
];

const PATTERNS = [
  // hairlines and sunken tiles flip back to ink-on-paper
  [/rgba\(232,\s*228,\s*216,\s*0?\.17\)/g, "rgba(26,35,31,.15)"],
  [/rgba\(232,\s*228,\s*216,\s*0?\.08\)/g, "rgba(26,35,31,.05)"],
  // shadows
  [/rgba\(0,\s*0,\s*0,\s*0?\.62\)/g, "rgba(26,35,31,.32)"],
  // ambient wash
  [/rgba\(226,\s*86,\s*74,\s*0?\.1[12]\)/g, "rgba(200,55,45,.07)"],
  [/rgba\(87,\s*161,\s*132,\s*0?\.1[34]\)/g, "rgba(47,107,86,.13)"],
  [/rgba\(226,\s*86,\s*74,\s*0?\.3\)/g, "rgba(200,55,45,.25)"],
  [/rgba\(184,\s*60,\s*49,\s*0?\.5\)/g, "rgba(157,42,33,.32)"],
  // the map veil is the page ground
  [/rgba\(15,\s*31,\s*26,\s*0?\.95\)/g, "rgba(234,240,234,.95)"],
  [/rgba\(15,\s*31,\s*26,\s*0\)/g, "rgba(234,240,234,0)"],
  // basemap: tint the grey OSM raster toward celadon instead of inverting it,
  // so the map reads as part of the palette rather than a grey hole in it
  [/filter:\s*invert\(1\)[^;}]*/g, "filter:sepia(.3) hue-rotate(52deg) saturate(1.25) brightness(1.03) contrast(.97)"],
];

for (const path of FILES) {
  let s = readFileSync(path, "utf8");
  const before = s;
  COLORS.forEach(([from], i) => {
    s = s.split(from).join(`@@${i}@@`);
    s = s.split(from.toUpperCase()).join(`@@${i}@@`);
  });
  COLORS.forEach(([, to], i) => { s = s.split(`@@${i}@@`).join(to); });
  for (const [re, to] of PATTERNS) s = s.replace(re, to);
  writeFileSync(path, s);
  console.log(`${path.split("/").pop().padEnd(12)} ${before === s ? "unchanged" : "repainted"}`);
}
