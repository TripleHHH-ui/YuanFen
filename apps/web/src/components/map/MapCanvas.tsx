import { useEffect, useRef } from "react";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapStop {
  lat: number;
  lng: number;
  label: string;
  sealed?: boolean;
  emoji?: string;
}

export interface MapRec {
  lat: number;
  lng: number;
  label: string;
  emoji: string;
}

interface Props {
  center: { lat: number; lng: number };
  stops: MapStop[];
  recommendations?: MapRec[];
}

/** Walking geometry resolved offline by scripts/build-route-mesh.mjs. */
interface Mesh {
  takes?: Array<{ stops: number; path: [number, number][] }>;
  legs?: Record<string, [number, number][]>;
}

const legKey = (a: MapStop, b: MapStop) =>
  [a.lng.toFixed(5), a.lat.toFixed(5), b.lng.toFixed(5), b.lat.toFixed(5)].join(",");

/**
 * The thread should walk the streets, not cut across blocks. Where we have a
 * routed leg for a pair of stops we use it; anything unrouted falls back to the
 * straight hop so the line is never broken.
 */
function threadCoords(stops: MapStop[], mesh: Mesh | null): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!, b = stops[i + 1]!;
    const leg = mesh?.legs?.[legKey(a, b)] ?? mesh?.legs?.[legKey(b, a)];
    if (leg?.length) {
      const seg = mesh!.legs![legKey(a, b)] ? leg : [...leg].reverse();
      if (out.length) seg.shift();
      out.push(...seg);
    } else {
      if (!out.length) out.push([a.lng, a.lat]);
      out.push([b.lng, b.lat]);
    }
  }
  return out;
}

// Desaturated OSM basemap: the vermilion thread owns the color.
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    { id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.9, "raster-brightness-min": 0.62, "raster-brightness-max": 0.88, "raster-opacity": 0.92 } }, { id: "tint", type: "background", paint: { "background-color": "#2f6b56", "background-opacity": 0.22 } },
  ],
};

export function MapCanvas({ center, stops, recommendations = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const recMarkersRef = useRef<Marker[]>([]);
  const readyRef = useRef(false);
  const forageRef = useRef<HTMLCanvasElement>(null);
  const foragedRef = useRef(false);
  const meshRef = useRef<Mesh | null>(null);
  // Latest props live in refs so the style-load callback and the effect both
  // draw the CURRENT stops — a plan arriving before the style finishes loading
  // must not be lost (the load event may lag the first route by seconds).
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const centerRef = useRef(center);
  centerRef.current = center;
  const recsRef = useRef(recommendations);
  recsRef.current = recommendations;

  function syncRecs() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    for (const m of recMarkersRef.current) m.remove();
    recMarkersRef.current = [];
    // Only show rec markers when there are no route stops
    if (stopsRef.current.length > 0) return;
    for (const r of recsRef.current) {
      const el = document.createElement("div");
      el.className = "pin-wrap";
      const pin = document.createElement("div");
      pin.className = "pin-rec";
      pin.setAttribute("title", r.label);
      const emojiSpan = document.createElement("span");
      emojiSpan.className = "pin-rec-emoji";
      emojiSpan.textContent = r.emoji;
      pin.appendChild(emojiSpan);
      el.appendChild(pin);
      recMarkersRef.current.push(new Marker({ element: el }).setLngLat([r.lng, r.lat]).addTo(map));
    }
  }

  /**
   * FR-006: the takes the planner actually produced, drawn as the paths they
   * are. They grow the way Physarum forages, then thin to a trace that stays —
   * the alternatives never leave the table, they just stop being the one you
   * are looking at. Walking geometry is resolved offline by
   * scripts/build-route-mesh.mjs; if it is missing we simply skip the beat.
   */
  async function playForage(map: MLMap) {
    if (foragedRef.current) return;
    foragedRef.current = true;
    const cv = forageRef.current;
    if (!cv) return;
    const mesh = meshRef.current;
    if (!mesh?.takes?.length) return;
    // every take the planner produced, as its real walking path. The one you
    // are looking at is drawn in cinnabar by the map's own route layer; these
    // are the others, still on the table.
    const edges = mesh.takes
      .filter((t) => t.path?.length)
      .map((t) => ({ pts: t.path, grow: 0, fade: 1 }));
    if (!edges.length) return;

    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const fit = () => {
      cv.width = cv.clientWidth * dpr;
      cv.height = cv.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();

    let alive = true;
    const draw = () => {
      if (!alive) return;
      ctx.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const e of edges) {
        if (e.grow <= 0 || e.fade <= 0) continue;
        const pts = e.pts.map(([lng, lat]) => map.project([lng, lat]));
        const n = Math.max(2, Math.round((pts.length - 1) * e.grow) + 1);
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < n; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
        ctx.strokeStyle = `rgba(184,145,42,${0.52 * e.fade})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      requestAnimationFrame(draw);
    };
    draw();

    const run = (ms: number, fn: (t: number) => void) =>
      new Promise<void>((done) => {
        const t0 = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / ms);
          fn(t);
          if (t < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });

    await run(1600, (t) => {
      edges.forEach((e, k) => {
        e.grow = Math.max(0, Math.min(1, (t - k * 0.11) / 0.6));
      });
    });
    await new Promise((r) => setTimeout(r, 700));
    // The rejected tubes thin out but never fully disappear: the point of the
    // beat is that the agent is still holding the alternatives it considered.
    await run(1300, (t) => {
      edges.forEach((e) => { e.fade = 1 - t * 0.5; });
    });
    // the loop keeps running so the trace re-projects as the map moves
    void alive;
  }

  function sync() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const current = stopsRef.current;
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    const line = current.map((s) => [s.lng, s.lat] as [number, number]);
    const walked = threadCoords(current, meshRef.current);
    const source = map.getSource("thread") as maplibregl.GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features:
        walked.length > 1
          ? [{ type: "Feature", geometry: { type: "LineString", coordinates: walked }, properties: {} }]
          : [],
    });
    current.forEach((s, i) => {
      const el = document.createElement("div");
      el.className = "pin-wrap";
      el.innerHTML = `<div class="pin ${s.sealed ? "pin-sealed" : ""}">${s.sealed ? "?" : `<span class="pin-n">${i + 1}</span>`}</div>`;
      el.title = s.label;
      markersRef.current.push(new Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map));
    });
    syncRecs();
    // On phones the itinerary lives in a bottom sheet, so the route must fit
    // into the map strip left above it; desktop reserves the left column.
    const phone = window.matchMedia("(max-width: 520px)").matches;
    const frame = phone
      ? { top: 60, bottom: Math.round(window.innerHeight * 0.68), left: 24, right: 24 }
      : { top: 90, bottom: 140, left: 430, right: 90 };
    if (line.length > 1) {
      const b = line.reduce(
        (acc, c) => acc.extend(c),
        new maplibregl.LngLatBounds(line[0]!, line[0]!),
      );
      // 14.6 left a tight CBD day using a third of the frame, with OSM's
      // city-level labels drawn larger than the route itself.
      map.fitBounds(b, { padding: frame, duration: 900, maxZoom: 15.5 });
      // once the camera has settled, show the search that produced this route
      window.setTimeout(() => void playForage(map), 950);
    } else if (phone) {
      // A near-point bounds keeps fitBounds' padding math while holding the
      // city in the strip above the sheet (maxZoom matches the desktop zoom).
      const c = centerRef.current;
      const eps = 0.001;
      map.fitBounds(
        new maplibregl.LngLatBounds([c.lng - eps, c.lat - eps], [c.lng + eps, c.lat + eps]),
        { padding: frame, duration: 900, maxZoom: 12.4 },
      );
    } else {
      const c = centerRef.current;
      map.easeTo({ center: [c.lng, c.lat], zoom: 12.4, duration: 900 });
    }
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [centerRef.current.lng, centerRef.current.lat],
      zoom: 12.4,
      attributionControl: { compact: true },
    });
    map.on("load", () => {
      map.addSource("thread", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "thread-casing",
        type: "line",
        source: "thread",
        paint: { "line-color": "#eaf0ea", "line-width": 7, "line-opacity": 0.9 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "thread",
        type: "line",
        source: "thread",
        paint: { "line-color": "#c8372d", "line-width": 2.5, "line-dasharray": [2.2, 1.4] },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      readyRef.current = true;
      void fetch("/route-mesh.json")
        .then((r) => (r.ok ? r.json() : null))
        .then((m) => { meshRef.current = m; })
        .catch(() => { meshRef.current = null; })
        .finally(() => sync());
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(stops), center.lat, center.lng]);

  useEffect(() => {
    syncRecs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(recommendations), JSON.stringify(stops)]);

  return (
    <div className="map-canvas">
      <div ref={containerRef} className="map-canvas-inner" />
      <canvas ref={forageRef} className="forage-layer" />
    </div>
  );
}
