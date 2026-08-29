// Verify the breadth expansion: place counts, tag coverage, coords, openHours, matrix shape.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  ".."
);
const TAGS = JSON.parse(
  (await readFile(path.join(ROOT, "packages/shared/src/types.ts"), "utf8"))
    .match(/VIBE_TAGS = \[([\s\S]*?)\]/)[1]
    .replace(/,\s*$/, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",")
    .replace(/^/, "[") + "]"
);

let fail = 0;
const files = (await readdir(path.join(ROOT, "data/places"))).filter((f) => f.endsWith(".json"));

console.log(`VIBE_TAGS (${TAGS.length}): ${TAGS.join(", ")}\n`);

for (const f of files.sort()) {
  const city = path.basename(f, ".json");
  const doc = JSON.parse(await readFile(path.join(ROOT, "data/places", f), "utf8"));
  const places = Array.isArray(doc) ? doc : doc.places;
  if (!Array.isArray(places) || places.length === 0) {
    console.log(`${city.padEnd(14)} SKIP (no places array)`);
    continue;
  }

  const ids = new Set(places.map((p) => p.id));
  const dupes = places.length - ids.size;

  const badCoords = places.filter(
    (p) => typeof p.lat !== "number" || typeof p.lng !== "number" || Math.abs(p.lat) > 90
  ).length;
  // openHours is either 7 weekday keys, or the {daily: [...]} shorthand.
  const badHours = places.filter((p) => {
    const h = p.openHours ?? {};
    return !("daily" in h) && Object.keys(h).length !== 7;
  }).length;
  const unknownTags = [...new Set(places.flatMap((p) => p.vibeTags ?? []))].filter(
    (t) => !TAGS.includes(t)
  );

  const counts = Object.fromEntries(TAGS.map((t) => [t, 0]));
  for (const p of places) for (const t of p.vibeTags ?? []) if (t in counts) counts[t]++;
  const thin = TAGS.filter((t) => counts[t] < 2);

  let matrix = "missing";
  try {
    const m = JSON.parse(await readFile(path.join(ROOT, "data/routing", f), "utf8"));
    const rows = m.minutes ?? m.matrix ?? (Array.isArray(m) ? m : null);
    if (!rows) throw new Error("no matrix rows");
    matrix =
      Array.isArray(rows) && rows.length === places.length && rows.every((r) => r.length === places.length)
        ? `${rows.length}x${rows[0].length} OK`
        : `MISMATCH (${rows.length} vs ${places.length} places)`;
  } catch {
    matrix = "unreadable";
  }

  const problems = [];
  if (dupes) problems.push(`${dupes} duplicate ids`);
  if (badCoords) problems.push(`${badCoords} bad coords`);
  if (badHours) problems.push(`${badHours} incomplete openHours`);
  if (unknownTags.length) problems.push(`unknown tags: ${unknownTags.join(",")}`);
  if (thin.length) problems.push(`tags under 2: ${thin.join(",")}`);
  if (!matrix.includes("OK")) problems.push(`matrix ${matrix}`);
  if (problems.length) fail++;

  console.log(
    `${city.padEnd(14)} ${String(places.length).padStart(3)} places  matrix ${matrix.padEnd(12)} ${
      problems.length ? "FAIL: " + problems.join("; ") : "ok"
    }`
  );
}

console.log(fail === 0 ? "\nAll cities pass." : `\n${fail} cities have problems.`);
process.exit(fail === 0 ? 0 : 1);
