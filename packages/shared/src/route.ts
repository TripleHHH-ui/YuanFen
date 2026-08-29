import { scorePlace } from "./taste.js";
import { totalWithBag } from "./fareboard.js";
import { narratePlan, narrateSwap } from "./narrate.js";
import type {
  DayPlan,
  FlightOption,
  Interval,
  Place,
  StopNode,
  TasteVector,
  TravelMatrix,
  TripGraph,
  VibeTag,
} from "./types.js";

// ---------- time helpers (wall-clock minutes; no host timezone involved) ----------

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function fmtMin(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function weekdayKey(date: string): (typeof WEEKDAY_KEYS)[number] {
  return WEEKDAY_KEYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function openIntervals(place: Place, date: string): Interval[] {
  const specific = place.openHours[weekdayKey(date)];
  return specific ?? place.openHours.daily ?? [];
}

/** Open at arrival with at least 30 min before closing (FR-005). */
function isOpenAt(place: Place, date: string, arriveMin: number): boolean {
  return openIntervals(place, date).some(
    ([o, c]) => arriveMin >= toMin(o) && arriveMin <= toMin(c) - 30,
  );
}

// ---------- day route builder ----------

export interface DayRouteOptions {
  date: string;
  startMin: number;
  endMin: number;
  taste: TasteVector;
  mustPlaceIds?: string[];
  mustTags?: string[];
  moodTags?: VibeTag[];
  area?: string;
  maxStops?: number;
  excludeIds?: Set<string>;
  includeWildcard?: boolean;
  /** Late-arrival night mode: at most one stop, food/nightlife only (FR-013). */
  nightFoodOnly?: boolean;
}

export interface DayRouteResult {
  stops: StopNode[];
  explanations: string[];
}

// Travel-penalty weight. Squared so short hops are nearly free but cross-town
// treks hurt disproportionately: 5 min ≈ 0.13 pt, 10 min ≈ 0.5 pt, 20 min ≈ 2 pt.
export const W_TRAVEL = 0.005;

// Mood-arc tuning: the wind-down bonus scales linearly from MOOD_BASE (early
// afternoon) to MOOD_BASE + MOOD_RAMP (closing hour). The ramp compensates for
// the quadratic travel penalty so a slightly further quiet stop still wins over
// a nearby non-quiet one when the day is winding down.
export const MOOD_BASE = 1.0;
export const MOOD_RAMP = 4.0;
export const MOOD_WINDOW_MIN = 150;

const FIRST_LEG_MIN = 15;

// Wildcards are sealed, taste-adjacent surprises. They are scheduled as an
// explicit shortened "drop in" visit so the fit check matches the displayed time.
const WILDCARD_STAY_MIN = 60;

// Treat two POIs within this many minutes as the same place cluster; the second
// one is skipped so the day does not return to an already-visited complex.
const DUPLICATE_TRAVEL_MIN = 2;

// Penalty for picking the same dominant category twice in a row (food-after-food
// being the worst offender).
const CONSECUTIVE_SAME_CATEGORY_PENALTY = 2.5;
const MEAL_WINDOWS: Array<[number, number]> = [
  [toMin("11:30"), toMin("13:30")],
  [toMin("18:00"), toMin("20:30")],
];

function travelBetween(matrix: TravelMatrix, from: string | null, to: string): number {
  if (!from) return FIRST_LEG_MIN;
  const i = matrix.ids.indexOf(from);
  const j = matrix.ids.indexOf(to);
  const v = matrix.minutes[i]?.[j];
  return v ?? FIRST_LEG_MIN;
}

function matchesMustTag(place: Place, mustTags: string[]): boolean {
  const name = place.name.toLowerCase();
  return mustTags.some(
    (t) => place.tags?.some((pt) => pt.toLowerCase() === t.toLowerCase()) || name.includes(t.toLowerCase()),
  );
}

function isMust(place: Place, opts: DayRouteOptions): boolean {
  return (
    (opts.mustPlaceIds?.includes(place.id) ?? false) ||
    (opts.mustTags ? matchesMustTag(place, opts.mustTags) : false)
  );
}

function roleFor(
  place: Place,
  opts: DayRouteOptions,
  alreadySatisfiedMustTags: Set<string> = new Set(),
): StopNode["role"] {
  if (opts.mustPlaceIds?.includes(place.id)) return "must";
  if (opts.mustTags) {
    const newlySatisfied = opts.mustTags.filter(
      (t) => matchesMustTag(place, [t]) && !alreadySatisfiedMustTags.has(t.toLowerCase()),
    );
    if (newlySatisfied.length > 0) return "must";
  }
  if (place.vibeTags.includes("food")) return "food";
  if (place.vibeTags.includes("chill") || place.vibeTags.includes("nature")) return "quiet";
  return "anchor";
}

type DominantCategory = "food" | "quiet" | "anchor";

function dominantCategory(place: Place): DominantCategory {
  if (place.vibeTags.includes("food")) return "food";
  if (place.vibeTags.includes("chill") || place.vibeTags.includes("nature")) return "quiet";
  return "anchor";
}

function isClusterDuplicate(place: Place, visited: Set<string>, matrix: TravelMatrix): boolean {
  for (const id of visited) {
    if (id === place.id) continue;
    const travel = travelBetween(matrix, id, place.id);
    if (travel <= DUPLICATE_TRAVEL_MIN) return true;
  }
  return false;
}

function slotScore(
  place: Place,
  opts: DayRouteOptions,
  arriveMin: number,
  travelMin: number,
  mustSatisfied: boolean,
  prevCategory: DominantCategory | null,
): number {
  let score = scorePlace(opts.taste, place);
  const isFood = place.vibeTags.includes("food");
  const inMeal = MEAL_WINDOWS.some(([a, b]) => arriveMin >= a && arriveMin <= b);
  if (isFood && inMeal) score += 1.2;
  if (isFood && !inMeal) score -= 0.8;
  const wildcardReserve = opts.includeWildcard !== false && !opts.nightFoodOnly ? WILDCARD_STAY_MIN : 0;
  const dayLeft = opts.endMin - wildcardReserve - arriveMin;
  if (opts.moodTags && dayLeft < MOOD_WINDOW_MIN && place.vibeTags.some((t) => opts.moodTags!.includes(t))) {
    const pressure = 1 - dayLeft / MOOD_WINDOW_MIN;
    score += MOOD_BASE + MOOD_RAMP * pressure;
  }
  if (opts.area && place.area.toLowerCase().includes(opts.area.toLowerCase())) score += 0.5;
  if (!mustSatisfied && isMust(place, opts)) score += 10;
  if (prevCategory && dominantCategory(place) === prevCategory) score -= CONSECUTIVE_SAME_CATEGORY_PENALTY;
  score -= W_TRAVEL * travelMin * travelMin;
  return score;
}

/** Wildcard = taste-adjacent but novel: decent score AND carries a tag the user hasn't expressed (FR-007). */
function pickWildcard(
  candidates: Place[],
  opts: DayRouteOptions,
  visited: Set<string>,
  cur: number,
  prev: string | null,
  matrix: TravelMatrix,
): StopNode | null {
  const novel = candidates
    .filter((p) => !visited.has(p.id) && !isClusterDuplicate(p, visited, matrix))
    .filter((p) => p.vibeTags.some((t) => (opts.taste[t] ?? 0) <= 0))
    .map((p) => {
      const travel = travelBetween(matrix, prev, p.id);
      const arrive = cur + travel;
      const score = scorePlace(opts.taste, p) - W_TRAVEL * travel * travel;
      return { p, travel, arrive, score };
    })
    .filter(({ p, arrive }) => isOpenAt(p, opts.date, arrive) && arrive + WILDCARD_STAY_MIN <= opts.endMin)
    .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id));
  const pick = novel[0];
  if (!pick) return null;
  return {
    placeId: pick.p.id,
    arrive: fmtMin(pick.arrive),
    depart: fmtMin(pick.arrive + WILDCARD_STAY_MIN),
    travelMinFromPrev: pick.travel,
    role: "wildcard",
    sealed: true,
  };
}

export function buildDayRoute(
  places: Place[],
  matrix: TravelMatrix,
  opts: DayRouteOptions,
): DayRouteResult {
  const visited = new Set(opts.excludeIds ?? []);
  const stops: StopNode[] = [];
  const explanations: string[] = [];
  const maxStops = opts.nightFoodOnly ? 1 : (opts.maxStops ?? 5);
  const wildcardReserve = opts.includeWildcard !== false && !opts.nightFoodOnly ? WILDCARD_STAY_MIN : 0;

  let cur = opts.startMin;
  let prev: string | null = null;
  let prevCategory: DominantCategory | null = null;
  const mustSatisfiedTags = new Set<string>();

  let pool = places.filter((p) => !visited.has(p.id) && !isClusterDuplicate(p, visited, matrix));
  if (opts.nightFoodOnly) {
    pool = pool.filter((p) => p.vibeTags.includes("food") || p.vibeTags.includes("nightlife"));
  }

  while (stops.length < maxStops) {
    const remaining = opts.endMin - wildcardReserve - cur;
    if (remaining < 45) break;
    const mustDone =
      (opts.mustTags ?? []).every((t) => mustSatisfiedTags.has(t.toLowerCase())) &&
      (opts.mustPlaceIds ?? []).every((id) => visited.has(id));
    const feasible = pool
      .filter((p) => !visited.has(p.id) && !isClusterDuplicate(p, visited, matrix))
      .map((p) => {
        const travel = travelBetween(matrix, prev, p.id);
        const arrive = cur + travel;
        return { p, travel, arrive };
      })
      .filter(
        ({ p, arrive }) =>
          isOpenAt(p, opts.date, arrive) && arrive + p.estStayMin <= opts.endMin - wildcardReserve,
      )
      .sort(
        (a, b) =>
          slotScore(b.p, opts, b.arrive, b.travel, mustDone, prevCategory) -
            slotScore(a.p, opts, a.arrive, a.travel, mustDone, prevCategory) ||
          a.p.id.localeCompare(b.p.id),
      );
    const pick = feasible[0];
    if (!pick) break;
    const newlySatisfiedMustTags = opts.mustTags?.filter(
      (t) => matchesMustTag(pick.p, [t]) && !mustSatisfiedTags.has(t.toLowerCase()),
    ) ?? [];
    stops.push({
      placeId: pick.p.id,
      arrive: fmtMin(pick.arrive),
      depart: fmtMin(pick.arrive + pick.p.estStayMin),
      travelMinFromPrev: pick.travel,
      role:
        opts.mustPlaceIds?.includes(pick.p.id) || newlySatisfiedMustTags.length > 0
          ? "must"
          : roleFor(pick.p, opts, mustSatisfiedTags),
    });
    visited.add(pick.p.id);
    for (const t of newlySatisfiedMustTags) mustSatisfiedTags.add(t.toLowerCase());
    cur = pick.arrive + pick.p.estStayMin;
    prev = pick.p.id;
    prevCategory = dominantCategory(pick.p);
  }

  if (wildcardReserve > 0) {
    const wildcard = pickWildcard(pool, opts, visited, cur, prev, matrix);
    if (wildcard) {
      stops.push(wildcard);
      visited.add(wildcard.placeId);
    }
  }

  // FR-012: guarantee-or-explain, exactly one line per dropped must.
  for (const id of opts.mustPlaceIds ?? []) {
    if (!visited.has(id)) {
      const place = places.find((p) => p.id === id);
      explanations.push(
        `${place?.name ?? id} (${id}) doesn't fit this day — closed or outside the time window.`,
      );
    }
  }
  for (const tag of opts.mustTags ?? []) {
    if (!mustSatisfiedTags.has(tag.toLowerCase())) {
      explanations.push(`No open spot for "${tag}" fits this window — left out of this plan.`);
    }
  }

  return { stops, explanations };
}

export function buildAlternatives(
  places: Place[],
  matrix: TravelMatrix,
  opts: DayRouteOptions,
  n = 3,
): DayRouteResult[] {
  const results: DayRouteResult[] = [];
  const exclude = new Set(opts.excludeIds ?? []);
  for (let v = 0; v < n; v++) {
    const result = buildDayRoute(places, matrix, { ...opts, excludeIds: new Set(exclude) });
    if (result.stops.length === 0) break;
    results.push(result);
    for (const s of result.stops) {
      const place = places.find((p) => p.id === s.placeId)!;
      if (!isMust(place, opts)) exclude.add(s.placeId);
    }
  }
  return results;
}

// ---------- trip builder (flight = node zero) ----------

export interface BuildTripInput {
  id: string;
  city: string;
  cityName: string;
  origin: string;
  destination: string;
  window: { start: string; end: string; holiday?: string };
  flight: { out: FlightOption; ret: FlightOption };
  places: Place[];
  matrix: TravelMatrix;
  taste: TasteVector;
  mustPlaceIds?: string[];
}

const ARRIVAL_BUFFER_MIN = 40;
const AIRPORT_CUTOFF_MIN = 240;
const DAY_START = toMin("09:30");
const SLOW_START = toMin("10:30");
const DAY_END = toMin("22:00");
const LATE_ARRIVAL = toMin("21:00");

function isLateArrival(out: FlightOption): boolean {
  return toMin(out.arriveLocal) + ARRIVAL_BUFFER_MIN >= LATE_ARRIVAL;
}

function tripDates(out: FlightOption, ret: FlightOption): string[] {
  const dates: string[] = [];
  let d = out.arriveDate;
  while (d <= ret.departDate) {
    dates.push(d);
    d = addDaysIso(d, 1);
  }
  return dates;
}

function buildDayFor(
  date: string,
  input: BuildTripInput,
  visited: Set<string>,
  wildcardPlaced: boolean,
): DayRouteResult & { date: string } {
  const { out, ret } = input.flight;
  const late = isLateArrival(out);
  let startMin = DAY_START;
  let endMin = DAY_END;
  let nightFoodOnly = false;
  if (date === out.arriveDate) {
    startMin = Math.max(DAY_START, toMin(out.arriveLocal) + ARRIVAL_BUFFER_MIN);
    if (late) {
      startMin = toMin(out.arriveLocal) + ARRIVAL_BUFFER_MIN;
      endMin = toMin("23:59");
      nightFoodOnly = true;
    }
  } else if (late && date === addDaysIso(out.arriveDate, 1)) {
    startMin = SLOW_START;
  }
  if (date === ret.departDate) {
    endMin = Math.min(endMin, toMin(ret.departLocal) - AIRPORT_CUTOFF_MIN);
  }
  const result = buildDayRoute(input.places, input.matrix, {
    date,
    startMin,
    endMin,
    taste: input.taste,
    mustPlaceIds: input.mustPlaceIds,
    excludeIds: visited,
    includeWildcard: !wildcardPlaced && !nightFoodOnly,
    nightFoodOnly,
  });
  return { ...result, date };
}

function groundCost(days: DayPlan[], places: Place[]): number {
  return days
    .flatMap((d) => d.stops)
    .reduce((sum, s) => sum + (places.find((p) => p.id === s.placeId)?.estCostSGD ?? 0), 0);
}

export function buildTrip(input: BuildTripInput): TripGraph {
  const { out, ret } = input.flight;
  const visited = new Set<string>();
  const days: DayPlan[] = [];
  const explanations: string[] = [];
  let wildcardPlaced = false;

  for (const date of tripDates(out, ret)) {
    const day = buildDayFor(date, input, visited, wildcardPlaced);
    // must-go explanations are trip-level: only keep ones from the last day,
    // since an unplaced must on day N may still fit on day N+1.
    days.push({ date: day.date, stops: day.stops });
    for (const s of day.stops) visited.add(s.placeId);
    if (day.stops.some((s) => s.role === "wildcard")) wildcardPlaced = true;
    if (date === ret.departDate) explanations.push(...day.explanations);
  }

  const flightTotal = totalWithBag(out) + totalWithBag(ret);
  const ground = groundCost(days, input.places);
  const graph: TripGraph = {
    id: input.id,
    city: input.city,
    origin: input.origin,
    destination: input.destination,
    window: input.window,
    flight: { out, ret },
    days,
    budget: {
      flightTotal,
      ground,
      total: flightTotal + ground,
      currency: out.price.currency,
    },
    narration: "",
    explanations,
  };
  graph.narration = narratePlan(graph, input.cityName, input.taste);
  return graph;
}

// ---------- reflow (FR-013/FR-014) ----------

export interface ReflowContext {
  places: Place[];
  matrix: TravelMatrix;
  taste: TasteVector;
  mustPlaceIds?: string[];
}

export interface ReflowResult {
  graph: TripGraph;
  delta: {
    fareDelta: number;
    rebuiltDates: string[];
    droppedDates: string[];
    addedDates: string[];
    dayOneStopsBefore: number;
    dayOneStopsAfter: number;
  };
}

function affectedDates(out: FlightOption): string[] {
  return isLateArrival(out) ? [out.arriveDate, addDaysIso(out.arriveDate, 1)] : [out.arriveDate];
}

export function reflow(graph: TripGraph, newOut: FlightOption, ctx: ReflowContext): ReflowResult {
  const oldOut = graph.flight.out;
  const ret = graph.flight.ret;
  const newDates = tripDates(newOut, ret);
  const rebuildSet = new Set([...affectedDates(oldOut), ...affectedDates(newOut)]);

  const keptDays = graph.days.filter((d) => newDates.includes(d.date) && !rebuildSet.has(d.date));
  const keptIds = new Set(keptDays.flatMap((d) => d.stops.map((s) => s.placeId)));
  let wildcardPlaced = keptDays.some((d) => d.stops.some((s) => s.role === "wildcard"));

  const input: BuildTripInput = {
    id: graph.id,
    city: graph.city,
    cityName: graph.city,
    origin: graph.origin,
    destination: graph.destination,
    window: graph.window,
    flight: { out: newOut, ret },
    places: ctx.places,
    matrix: ctx.matrix,
    taste: ctx.taste,
    mustPlaceIds: ctx.mustPlaceIds,
  };

  const visited = new Set(keptIds);
  const days: DayPlan[] = [];
  for (const date of newDates) {
    const kept = keptDays.find((d) => d.date === date);
    if (kept) {
      days.push(kept);
      continue;
    }
    const day = buildDayFor(date, input, visited, wildcardPlaced);
    days.push({ date: day.date, stops: day.stops });
    for (const s of day.stops) visited.add(s.placeId);
    if (day.stops.some((s) => s.role === "wildcard")) wildcardPlaced = true;
  }

  const fareDelta = totalWithBag(newOut) - totalWithBag(oldOut);
  const flightTotal = totalWithBag(newOut) + totalWithBag(ret);
  const ground = groundCost(days, ctx.places);

  const oldDates = graph.days.map((d) => d.date);
  const delta = {
    fareDelta,
    rebuiltDates: newDates.filter((d) => rebuildSet.has(d)),
    droppedDates: oldDates.filter((d) => !newDates.includes(d)),
    addedDates: newDates.filter((d) => !oldDates.includes(d)),
    dayOneStopsBefore: graph.days[0]?.stops.length ?? 0,
    dayOneStopsAfter: days[0]?.stops.length ?? 0,
  };

  const next: TripGraph = {
    ...graph,
    flight: { out: newOut, ret },
    days,
    budget: { flightTotal, ground, total: flightTotal + ground, currency: graph.budget.currency },
    narration: narrateSwap(oldOut, newOut, delta),
  };
  return { graph: next, delta };
}

// ---------- stop-level swap (single stop, forward re-chain) ----------

export interface SwapStopInput {
  day: DayPlan;
  stopIndex: number;
  replacementPlaceId: string;
  places: Place[];
  matrix: TravelMatrix;
  opts: DayRouteOptions;
}

export interface SwapStopResult {
  day: DayPlan;
  costDeltaSGD: number;
  travelDeltaMin: number;
  droppedStops: string[];
  mustDropped: boolean;
}

function dayCost(stops: StopNode[], places: Place[]): number {
  return stops.reduce((sum, s) => sum + (places.find((p) => p.id === s.placeId)?.estCostSGD ?? 0), 0);
}

function dayTravel(stops: StopNode[]): number {
  return stops.reduce((sum, s) => sum + s.travelMinFromPrev, 0);
}

export function swapStop(input: SwapStopInput): SwapStopResult {
  const { day, stopIndex, replacementPlaceId, places, matrix, opts } = input;
  const replacement = places.find((p) => p.id === replacementPlaceId);
  if (!replacement) throw new Error(`Unknown place: ${replacementPlaceId}`);
  if (stopIndex < 0 || stopIndex >= day.stops.length) throw new Error(`Invalid stop index: ${stopIndex}`);

  const before = day.stops.slice(0, stopIndex);
  const oldAfter = day.stops.slice(stopIndex + 1);
  const oldAll = day.stops;

  const newStops: StopNode[] = [...before];
  const prevStop = before.length > 0 ? before[before.length - 1]! : null;
  const prevPlaceId = prevStop?.placeId ?? null;
  const curMin = prevStop ? toMin(prevStop.depart) : opts.startMin;

  const travel = travelBetween(matrix, prevPlaceId, replacementPlaceId);
  const arrive = curMin + travel;
  newStops.push({
    placeId: replacementPlaceId,
    arrive: fmtMin(arrive),
    depart: fmtMin(arrive + replacement.estStayMin),
    travelMinFromPrev: travel,
    role: roleFor(replacement, opts),
  });

  let chainCur = arrive + replacement.estStayMin;
  let chainPrev = replacementPlaceId;
  const droppedStops: string[] = [];

  for (const stop of oldAfter) {
    const place = places.find((p) => p.id === stop.placeId);
    if (!place) { droppedStops.push(stop.placeId); continue; }
    const t = travelBetween(matrix, chainPrev, stop.placeId);
    const a = chainCur + t;
    if (!isOpenAt(place, opts.date, a)) { droppedStops.push(stop.placeId); continue; }
    if (a + place.estStayMin > opts.endMin) { droppedStops.push(stop.placeId); continue; }
    newStops.push({
      placeId: stop.placeId,
      arrive: fmtMin(a),
      depart: fmtMin(a + place.estStayMin),
      travelMinFromPrev: t,
      role: stop.role,
    });
    chainCur = a + place.estStayMin;
    chainPrev = stop.placeId;
  }

  const costDeltaSGD = dayCost(newStops, places) - dayCost(oldAll, places);
  const travelDeltaMin = dayTravel(newStops) - dayTravel(oldAll);
  const mustIds = new Set(opts.mustPlaceIds ?? []);
  const mustDropped = droppedStops.some((id) => mustIds.has(id));

  return {
    day: { date: day.date, stops: newStops },
    costDeltaSGD,
    travelDeltaMin,
    droppedStops,
    mustDropped,
  };
}

export interface AlternativesInput {
  day: DayPlan;
  stopIndex: number;
  places: Place[];
  matrix: TravelMatrix;
  opts: DayRouteOptions;
}

export function alternativesForStop(input: AlternativesInput): Place[] {
  const { day, stopIndex, places, matrix, opts } = input;
  const inDay = new Set(day.stops.map((s) => s.placeId));
  const prevPlaceId = stopIndex > 0 ? day.stops[stopIndex - 1]!.placeId : null;
  const nextPlaceId = stopIndex < day.stops.length - 1 ? day.stops[stopIndex + 1]!.placeId : null;
  const curMin = stopIndex > 0 ? toMin(day.stops[stopIndex - 1]!.depart) : opts.startMin;

  const candidates = places
    .filter((p) => !inDay.has(p.id))
    .filter((p) => !isClusterDuplicate(p, inDay, matrix))
    .map((p) => {
      const travel = travelBetween(matrix, prevPlaceId, p.id);
      const arrive = curMin + travel;
      const nextTravel = nextPlaceId ? travelBetween(matrix, p.id, nextPlaceId) : 0;
      return { p, travel, arrive, nextTravel };
    })
    .filter(({ p, arrive, nextTravel }) => {
      if (!isOpenAt(p, opts.date, arrive)) return false;
      if (arrive + p.estStayMin > opts.endMin) return false;
      if (nextPlaceId && arrive + p.estStayMin + nextTravel > opts.endMin) return false;
      return true;
    })
    .sort((a, b) => scorePlace(opts.taste, b.p) - scorePlace(opts.taste, a.p) || a.p.id.localeCompare(b.p.id));

  return candidates.slice(0, 6).map((c) => c.p);
}
