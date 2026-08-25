import {
  buildAlternatives,
  buildTrip,
  reflow,
  toMin,
  totalWithBag,
  type DayRouteResult,
  type FlightOption,
  type Place,
  type TasteVector,
  type TripGraph,
} from "@yuanfen/shared";
import { loadCity, loadDestinations, loadMatrix } from "../data.js";
import { parseIntent, type ParsedIntent } from "../intent.js";
import type { AtlasClient } from "../atlas/types.js";
import { departDateFor, nextLongWeekend } from "./fare_board.js";

/**
 * RouteAgent: owns the trip graph — S1 day routes, S3 deal expansion into a
 * full TripGraph, and the S4 reflow. This is the workload that would get the
 * expensive model tier in Qoder's sub-agent routing; here it is deterministic
 * engine orchestration.
 */

export interface EnrichedStop {
  placeId: string;
  arrive: string;
  depart: string;
  travelMinFromPrev: number;
  role: string;
  sealed?: boolean;
  place: Pick<Place, "id" | "name" | "lat" | "lng" | "emoji" | "blurb" | "area" | "vibeTags" | "estCostSGD"> | null;
}

function enrich(result: DayRouteResult, places: Place[]): { stops: EnrichedStop[]; explanations: string[] } {
  return {
    stops: result.stops.map((s) => {
      const p = places.find((x) => x.id === s.placeId) ?? null;
      return {
        ...s,
        place: p
          ? // A sealed wildcard stays sealed on the wire — the reveal happens
            // client-side on tap, but the identity must not leak in the payload.
            s.sealed
            ? { id: p.id, name: "???", lat: p.lat, lng: p.lng, emoji: "🎁", blurb: "Sealed wildcard — tap to reveal", area: p.area, vibeTags: [], estCostSGD: p.estCostSGD }
            : { id: p.id, name: p.name, lat: p.lat, lng: p.lng, emoji: p.emoji, blurb: p.blurb, area: p.area, vibeTags: p.vibeTags, estCostSGD: p.estCostSGD }
          : null,
      };
    }),
    explanations: result.explanations,
  };
}

function nextSaturday(from = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const shift = (6 - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + shift);
  return d.toISOString().slice(0, 10);
}

export function planChat(text: string, taste: TasteVector, date?: string) {
  const intent: ParsedIntent = parseIntent(text);
  if (!intent.city) {
    return {
      intent,
      error: "Tell me the city — e.g. \"Day trip in Singapore CBD, must eat chicken rice, then somewhere quiet\".",
    };
  }
  const city = loadCity(intent.city);
  const matrix = loadMatrix(intent.city);
  const planDate = date ?? nextSaturday();
  const alternatives = buildAlternatives(city.places, matrix, {
    date: planDate,
    startMin: toMin("09:30"),
    endMin: toMin("21:30"),
    taste,
    mustTags: intent.mustTags,
    moodTags: intent.moodTags,
    ...(intent.area ? { area: intent.area } : {}),
  });
  const first = alternatives[0];
  const anchor = intent.mustTags[0] ?? intent.moodTags[0] ?? "your taste";
  return {
    intent,
    date: planDate,
    city: { id: city.city, name: city.cityName, center: city.center },
    alternatives: alternatives.map((a) => enrich(a, city.places)),
    narration: first
      ? `Mapped a ${first.stops.length}-stop ${intent.area ?? city.cityName} day around ${anchor} — swipe the card for another take.`
      : `Nothing fits that window — try widening the day.`,
  };
}

// ---------- trips (S3 expand + S4 swap) ----------

interface StoredTrip {
  graph: TripGraph;
  cityId: string;
  flightOptions: FlightOption[];
  taste: TasteVector;
}

const trips = new Map<string, StoredTrip>();
let tripCounter = 0;

export async function createTripFromDeal(
  destination: string,
  taste: TasteVector,
  client: AtlasClient,
): Promise<{ trip?: ReturnType<typeof tripView>; error?: string }> {
  const { origin, profiles } = loadDestinations();
  const profile = profiles[destination];
  if (!profile?.hasCityFile) return { error: `No full trip data for ${destination}` };

  const weekend = nextLongWeekend(new Date().toISOString().slice(0, 10));
  if (!weekend) return { error: "No upcoming long weekend" };
  const outDate = departDateFor(weekend);

  // Flight candidates: fare-board window searches (evening-before + morning-of).
  const options: FlightOption[] = [];
  for (const depart of [outDate, weekend.start]) {
    const env = await client.search({ origin, destination, depart, adults: 1 });
    if (env.status === "ok" && env.data) options.push(...env.data.offers);
  }
  if (options.length === 0) return { error: `No flights for ${destination}` };

  const retEnv = await client.search({ origin: destination, destination: origin, depart: weekend.end, adults: 1 });
  const ret = retEnv.data?.offers[0];
  if (!ret) return { error: `No return flight for ${destination}` };

  const out = [...options].sort((a, b) => totalWithBag(a) - totalWithBag(b))[0]!;
  const city = loadCity(profile.city);
  const matrix = loadMatrix(profile.city);
  tripCounter += 1;
  const graph = buildTrip({
    id: `trip-${tripCounter}`,
    city: profile.city,
    cityName: profile.cityName,
    origin,
    destination,
    window: { start: weekend.start, end: weekend.end, holiday: weekend.holiday },
    flight: { out, ret },
    places: city.places,
    matrix,
    taste,
  });
  trips.set(graph.id, { graph, cityId: profile.city, flightOptions: options, taste });
  return { trip: tripView(graph.id)! };
}

export function tripView(id: string) {
  const stored = trips.get(id);
  if (!stored) return null;
  const city = loadCity(stored.cityId);
  return {
    graph: {
      ...stored.graph,
      days: stored.graph.days.map((d) => ({ date: d.date, ...enrich({ stops: d.stops, explanations: [] }, city.places) })),
    },
    cityName: city.cityName,
    center: city.center,
    flightOptions: stored.flightOptions.map((o) => ({ ...o, totalWithBag: totalWithBag(o) })),
  };
}

export function swapFlight(id: string, offerId: string) {
  const stored = trips.get(id);
  if (!stored) return { error: "Unknown trip" };
  const next = stored.flightOptions.find((o) => o.offer_id === offerId);
  if (!next) return { error: "Unknown offer for this trip" };
  const city = loadCity(stored.cityId);
  const matrix = loadMatrix(stored.cityId);
  const result = reflow(stored.graph, next, { places: city.places, matrix, taste: stored.taste });
  stored.graph = result.graph;
  return { trip: tripView(id)!, delta: result.delta, narration: result.graph.narration };
}

export function resetTrips(): void {
  trips.clear();
  tripCounter = 0;
}
