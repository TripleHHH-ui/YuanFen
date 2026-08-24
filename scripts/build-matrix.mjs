// Build pairwise travel-time matrices (minutes) for each city places file.
// Walking for legs <= 2.0 km (4.5 km/h + 2 min buffer); driving otherwise.
// Driving tries the public OSRM demo server once per city; on any failure it
// falls back to a haversine estimate (x1.35 route factor, 24 km/h, +7 min).
// Output: data/routing/<city>.json — checked in, regeneration optional.
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "..");
const PLACES_DIR = path.join(ROOT, "data", "places");
const OUT_DIR = path.join(ROOT, "data", "routing");

const WALK_KMH = 4.5;
const WALK_MAX_KM = 2.0;
const DRIVE_KMH = 24;
const DRIVE_FACTOR = 1.35;
const DRIVE_OVERHEAD_MIN = 7;

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function osrmDriveMinutes(coords) {
  const locs = coords.map((c) => `${c.lng},${c.lat}`).join(";");
  const url = `https://router.project-osrm.org/table/v1/driving/${locs}?annotations=duration`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const json = await res.json();
  if (json.code !== "Ok" || !json.durations) throw new Error(`OSRM code ${json.code}`);
  return json.durations.map((row) => row.map((sec) => (sec == null ? null : sec / 60)));
}

for (const file of await readdir(PLACES_DIR)) {
  if (!file.endsWith(".json")) continue;
  const cityData = JSON.parse(await readFile(path.join(PLACES_DIR, file), "utf8"));
  const places = cityData.places;
  if (!Array.isArray(places)) continue; // e.g. destinations.json profile map
  const n = places.length;

  let osrm = null;
  let method = "estimate";
  try {
    osrm = await osrmDriveMinutes(places);
    method = "osrm+walk";
  } catch (err) {
    console.warn(`${cityData.city}: OSRM unavailable (${err.message}), using estimates`);
  }

  const minutes = [];
  const mode = [];
  for (let i = 0; i < n; i++) {
    minutes.push([]);
    mode.push([]);
    for (let j = 0; j < n; j++) {
      if (i === j) {
        minutes[i].push(0);
        mode[i].push("none");
        continue;
      }
      const km = haversineKm(places[i], places[j]);
      if (km <= WALK_MAX_KM) {
        minutes[i].push(Math.round((km / WALK_KMH) * 60 + 2));
        mode[i].push("walk");
      } else {
        const est = (km * DRIVE_FACTOR * 60) / DRIVE_KMH + DRIVE_OVERHEAD_MIN;
        const fromOsrm = osrm?.[i]?.[j];
        minutes[i].push(Math.round(fromOsrm != null ? fromOsrm + DRIVE_OVERHEAD_MIN : est));
        mode[i].push("drive");
      }
    }
  }

  await mkdir(OUT_DIR, { recursive: true });
  const out = {
    city: cityData.city,
    generatedAt: new Date().toISOString(),
    method,
    ids: places.map((p) => p.id),
    minutes,
    mode,
  };
  await writeFile(path.join(OUT_DIR, `${cityData.city}.json`), JSON.stringify(out));
  console.log(`${cityData.city}: ${n}x${n} matrix (${method})`);
}
