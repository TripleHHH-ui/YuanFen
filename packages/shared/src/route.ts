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

const FIRST_LEG_MIN = 15;
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

function roleFor(place: Place, opts: DayRouteOptions): StopNode["role"] {
  if (isMust(place, opts)) return "must";
  if (place.vibeTags.includes("food")) return "food";
  if (place.vibeTags.includes("chill") || place.vibeTags.includes("nature")) return "quiet";
  return "anchor";
}

function slotScore(
  place: Place,
  opts: DayRouteOptions,
  arriveMin: number,
  travelMin: number,
  remainingMin: number,
  mustSatisfied: boolean,
): number {
  let score = scorePlace(opts.taste, place);
  const isFood = place.vibeTags.includes("food");
  const inMeal = MEAL_WINDOWS.some(([a, b]) => arriveMin >= a && arriveMin <= b);
  if (isFood && inMeal) score += 1.2;
  if (isFood && !inMeal) score -= 0.8;
  if (opts.moodTags && remainingMin < 150 && place.vibeTags.some((t) => opts.moodTags!.includes(t)))
    score += 1.0;
  if (opts.area && place.area.toLowerCase().includes(opts.area.toLowerCase())) score += 0.5;
  if (!mustSatisfied && isMust(place, opts)) score += 10;
  score -= travelMin / 60;
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
    .filter((p) => !visited.has(p.id))
    .filter((p) => p.vibeTags.some((t) => (opts.taste[t] ?? 0) <= 0))
    .map((p) => {
      const travel = travelBetween(matrix, prev, p.id);
      const arrive = cur + travel;
      return { p, travel, arrive };
    })
    .filter(({ p, arrive }) => isOpenAt(p, opts.date, arrive) && arrive + Math.min(p.estStayMin, 60) <= opts.endMin)
    .sort((a, b) => scorePlace(opts.taste, b.p) - scorePlace(opts.taste, a.p) || a.p.id.localeCompare(b.p.id));
  const pick = novel[0];
  if (!pick) return null;
  return {
    placeId: pick.p.id,
    arrive: fmtMin(pick.arrive),
    depart: fmtMin(pick.arrive + Math.min(pick.p.estStayMin, 60)),
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
  const wildcardReserve = opts.includeWildcard !== false && !opts.nightFoodOnly ? 60 : 0;

  let cur = opts.startMin;
  let prev: string | null = null;
  const mustSatisfiedTags = new Set<string>();

  let pool = places.filter((p) => !visited.has(p.id));
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
      .filter((p) => !visited.has(p.id))
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
          slotScore(b.p, opts, b.arrive, b.travel, opts.endMin - b.arrive, mustDone) -
            slotScore(a.p, opts, a.arrive, a.travel, opts.endMin - a.arrive, mustDone) ||
          a.p.id.localeCompare(b.p.id),
      );
    const pick = feasible[0];
    if (!pick) break;
    stops.push({
      placeId: pick.p.id,
      arrive: fmtMin(pick.arrive),
      depart: fmtMin(pick.arrive + pick.p.estStayMin),
      travelMinFromPrev: pick.travel,
      role: roleFor(pick.p, opts),
    });
    visited.add(pick.p.id);
    if (opts.mustTags) {
      for (const t of opts.mustTags) if (matchesMustTag(pick.p, [t])) mustSatisfiedTags.add(t.toLowerCase());
    }
    cur = pick.arrive + pick.p.estStayMin;
    prev = pick.p.id;
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
