/**
 * Precompute the forage mesh for the promo map scene.
 *
 * Pulls a real plan + real nearby candidates from the running API, then asks a
 * real walking router for the street geometry of every edge. Written once to
 * public/route-mesh.json so the recording is deterministic and offline.
 *
 * Usage: node scripts/build-route-mesh.mjs   (needs npm run dev up)
 */
import { writeFileSync } from "node:fs";

const API = "http://localhost:8787";
const OUT = "apps/web/public/route-mesh.json";
// project-osrm serves the car profile even on /foot/; this instance walks.
const ROUTER = "https://routing.openstreetmap.de/routed-foot/route/v1/foot/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, body) {
  const res = await fetch(API + path, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : undefined);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

async function walk(a, b) {
  const url = `${ROUTER}${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "YuanFen-demo/0.1" } });
      if (!res.ok) throw new Error(String(res.status));
      const c = (await res.json()).routes?.[0]?.geometry?.coordinates;
      if (c?.length) return c;
      throw new Error("empty geometry");
    } catch (e) {
      if (attempt === 4) return null;
      await sleep(2200);
    }
  }
  return null;
}

// --- real product data ------------------------------------------------------
await api("/api/taste/seed", { tags: ["food", "coffee", "culture", "views", "chill"] });
const deck = await api("/api/taste/deck");
for (const c of deck.cards.slice(0, 8)) {
  await api("/api/taste/swipe", { cardId: c.id, action: "like" });
}
const nearby = await api("/api/places/nearby/singapore");
const plan = await api("/api/plan/chat", {
  text: "Day trip in Singapore CBD, must eat chicken rice, then somewhere quiet",
  date: "2026-09-05",
  city: "singapore",
});
if (!plan.alternatives?.length) throw new Error("no plan alternatives");

// every take the agent produced — these are the gold paths on the map
const takes = [];
// every routed leg, keyed by its endpoints so the app can rebuild any
// itinerary that walks the same pairs — including ones we did not enumerate
const legs = {};
const key = (a, b) =>
  [a.lng.toFixed(5), a.lat.toFixed(5), b.lng.toFixed(5), b.lat.toFixed(5)].join(",");
for (const alt of plan.alternatives) {
  const st = alt.stops.filter((s) => s.place);
  const path = [];
  for (let i = 0; i < st.length - 1; i++) {
    const leg = await walk(st[i].place, st[i + 1].place);
    if (leg) {
      path.push(...leg);
      legs[key(st[i].place, st[i + 1].place)] = leg;
    }
    else path.push([st[i].place.lng, st[i].place.lat], [st[i + 1].place.lng, st[i + 1].place.lat]);
    process.stdout.write(leg ? "." : "x");
    await sleep(700);
  }
  takes.push({ stops: st.length, path });
}
console.log();

// Any plan drawn from this pool can be walked, so route every pair once —
// otherwise a take we did not enumerate falls back to straight hops.
const pool = new Map();
for (const alt of plan.alternatives) {
  for (const st of alt.stops) if (st.place) pool.set(st.placeId, st.place);
}
const pool2 = [...pool.values()];
let extra = 0;
for (let i = 0; i < pool2.length; i++) {
  for (let j = i + 1; j < pool2.length; j++) {
    const k1 = key(pool2[i], pool2[j]);
    if (legs[k1]) continue;
    const leg = await walk(pool2[i], pool2[j]);
    if (leg) { legs[k1] = leg; extra += 1; }
    process.stdout.write(leg ? "+" : "-");
    await sleep(650);
  }
}
console.log(`\n${pool2.length} places, ${Object.keys(legs).length} legs (${extra} extra)`);

const stops = plan.alternatives[0].stops.filter((s) => s.place);
writeFileSync(OUT, JSON.stringify({
  city: plan.city,
  narration: plan.narration,
  stops: stops.map((s) => ({
    placeId: s.placeId, arrive: s.arrive, depart: s.depart,
    place: { name: s.place.name, lat: s.place.lat, lng: s.place.lng, emoji: s.place.emoji, photoUrl: s.place.photoUrl },
  })),
  takes,
  legs,
}, null, 1));
console.log(`wrote ${OUT}`);
