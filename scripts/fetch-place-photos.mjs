/**
 * Resolve a real photo URL for each curated place and write it back into
 * data/places/<city>.json as `photoUrl` + `photoCredit`.
 *
 * Source: Wikipedia (precise subject) with a Wikimedia Commons fallback.
 * Both are hotlinked from upload.wikimedia.org — nothing is downloaded.
 *
 * A place only gets a photo when we can tie the image back to its NAME.
 * Geosearch is deliberately not used: it returns whatever is nearby, which
 * gave us a photo of Merdeka 118 for a cafe 400m away.
 *
 * Usage: node scripts/fetch-place-photos.mjs [city ...]
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DATA = join(process.cwd(), "data", "places");
const UA = "YuanFen-hackathon-demo/0.1 (https://github.com/TripleHHH-ui/trip-graph-agent)";

// Image kinds that are not photographs of the place.
const BAD_FILE = /\.svg|logo|map\b|seal|flag|coat[_ ]of|icon|banner|wordmark|locator|location_map|blank|emblem|crest/i;
// Words too generic to prove an image is about this specific place.
const GENERIC = new Set([
  "food", "centre", "center", "park", "museum", "cafe", "coffee", "market", "street",
  "temple", "hotel", "garden", "gardens", "house", "hall", "city", "old", "new", "the",
  "and", "bar", "club", "shop", "store", "mall", "road", "river", "beach", "island",
  "national", "public", "grand", "royal", "little", "big", "hawker", "night", "day",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

/**
 * upload.wikimedia.org only serves thumbnail widths it has already generated —
 * asking for an arbitrary one returns HTTP 400. So we never rewrite a width,
 * and we confirm the URL really serves an image before writing it into the data.
 */
async function servesAnImage(url) {
  try {
    const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA } });
    return res.ok && (res.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}

/** Distinctive lowercase tokens from a place name. */
function tokens(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !GENERIC.has(w));
}

/** Does this image title actually name the place? */
function subjectMatches(title, name) {
  const t = title.toLowerCase();
  const toks = tokens(name);
  if (toks.length === 0) return false;
  return toks.some((w) => t.includes(w));
}

/** Ask Wikipedia for the page's lead image — precise subject when the page exists. */
async function fromWikipedia(name, cityName) {
  for (const q of [name, `${name} ${cityName}`]) {
    const j = await getJson(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q.replace(/ /g, "_"))}`,
    );
    await sleep(120);
    if (!j || j.type === "disambiguation" || !j.thumbnail?.source) continue;
    const src = j.thumbnail.source.split("?")[0];
    if (BAD_FILE.test(src)) continue; // logos, maps, coats of arms
    if (!subjectMatches(decodeURIComponent(src), name) && !subjectMatches(j.title ?? "", name)) continue;
    if (!(await servesAnImage(src))) continue;
    return { url: src, credit: `Wikipedia · ${j.title}` };
  }
  return null;
}

/** Fall back to a Commons file-title search, still gated on the place name. */
async function fromCommons(name, cityName) {
  const j = await getJson(
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
      "&generator=search&gsrnamespace=6&gsrlimit=10" +
      `&gsrsearch=${encodeURIComponent(`${name} ${cityName} filetype:bitmap`)}` +
      "&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640",
  );
  await sleep(120);
  const pages = Object.values(j?.query?.pages ?? {});
  for (const p of pages) {
    const title = (p.title ?? "").replace(/^File:/, "");
    if (BAD_FILE.test(title)) continue;
    if (!subjectMatches(title, name)) continue;
    const info = p.imageinfo?.[0];
    if (!info?.thumburl) continue;
    const url = info.thumburl.split("?")[0]; // drop the API's utm_* tracking params
    if (!(await servesAnImage(url))) continue;
    const artist = (info.extmetadata?.Artist?.value ?? "").replace(/<[^>]*>/g, "").trim();
    const lic = info.extmetadata?.LicenseShortName?.value ?? "Wikimedia Commons";
    return { url, credit: `${artist || "Wikimedia Commons"} · ${lic}` };
  }
  return null;
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((c) => `${c}.json`)
  : readdirSync(DATA).filter((f) => f.endsWith(".json") && f !== "destinations.json");

for (const file of files) {
  const path = join(DATA, file);
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const cityName = doc.cityName ?? "";
  let hit = 0;

  for (const place of doc.places) {
    const found = (await fromWikipedia(place.name, cityName)) ?? (await fromCommons(place.name, cityName));
    if (found) {
      place.photoUrl = found.url;
      place.photoCredit = found.credit;
      hit += 1;
    } else {
      delete place.photoUrl;
      delete place.photoCredit;
    }
    process.stdout.write(found ? "." : "·");
  }

  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`\n${file}: ${hit}/${doc.places.length} photos`);
}
