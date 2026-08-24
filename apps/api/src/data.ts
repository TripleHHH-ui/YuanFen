import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CityPlaces, Holiday, TravelMatrix } from "@yuanfen/shared";
import type { DestinationProfile } from "@yuanfen/shared";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DATA = path.join(REPO_ROOT, "data");

function readJson<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(path.join(DATA, ...segments), "utf8")) as T;
}

const cityCache = new Map<string, CityPlaces>();
const matrixCache = new Map<string, TravelMatrix>();

export function loadCity(city: string): CityPlaces {
  if (!cityCache.has(city)) cityCache.set(city, readJson<CityPlaces>("places", `${city}.json`));
  return cityCache.get(city)!;
}

export function loadMatrix(city: string): TravelMatrix {
  if (!matrixCache.has(city)) matrixCache.set(city, readJson<TravelMatrix>("routing", `${city}.json`));
  return matrixCache.get(city)!;
}

export function loadHolidays(): Holiday[] {
  return readJson<{ holidays: Holiday[] }>("holidays", "sg.json").holidays;
}

export function loadDestinations(): { origin: string; profiles: Record<string, DestinationProfile> } {
  const raw = readJson<{ origin: string; destinations: Record<string, DestinationProfile> }>(
    "places",
    "destinations.json",
  );
  return { origin: raw.origin, profiles: raw.destinations };
}
