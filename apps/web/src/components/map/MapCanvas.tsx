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

interface Props {
  center: { lat: number; lng: number };
  stops: MapStop[];
}

// Desaturated Positron basemap: the vermilion thread owns the color.
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    { id: "carto", type: "raster", source: "carto", paint: { "raster-saturation": -0.85, "raster-opacity": 0.92 } },
  ],
};

export function MapCanvas({ center, stops }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const readyRef = useRef(false);
  // Latest props live in refs so the style-load callback and the effect both
  // draw the CURRENT stops — a plan arriving before the style finishes loading
  // must not be lost (the load event may lag the first route by seconds).
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const centerRef = useRef(center);
  centerRef.current = center;

  function sync() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const current = stopsRef.current;
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    const line = current.map((s) => [s.lng, s.lat] as [number, number]);
    const source = map.getSource("thread") as maplibregl.GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features:
        line.length > 1
          ? [{ type: "Feature", geometry: { type: "LineString", coordinates: line }, properties: {} }]
          : [],
    });
    current.forEach((s, i) => {
      const el = document.createElement("div");
      el.className = "pin-wrap";
      el.innerHTML = `<div class="pin ${s.sealed ? "pin-sealed" : ""}">${s.sealed ? "?" : `<span class="pin-n">${i + 1}</span>`}</div>`;
      el.title = s.label;
      markersRef.current.push(new Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map));
    });
    if (line.length > 1) {
      const b = line.reduce(
        (acc, c) => acc.extend(c),
        new maplibregl.LngLatBounds(line[0]!, line[0]!),
      );
      map.fitBounds(b, { padding: { top: 90, bottom: 140, left: 430, right: 90 }, duration: 900, maxZoom: 14.6 });
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
        paint: { "line-color": "#f6f2ea", "line-width": 7, "line-opacity": 0.9 },
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
      sync();
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

  return <div ref={containerRef} className="map-canvas" />;
}
