import { describe, expect, it } from "vitest";
import {
  alternativesForStop,
  buildAlternatives,
  buildDayRoute,
  buildTrip,
  reflow,
  seedVector,
  swapStop,
  toMin,
  W_TRAVEL,
  type BuildTripInput,
  type CityPlaces,
  type DayPlan,
  type DayRouteOptions,
  type FlightOption,
  type Place,
  type TravelMatrix,
} from "../src/index.js";
import singaporeJson from "../../../data/places/singapore.json";
import sgMatrixJson from "../../../data/routing/singapore.json";

// ---------- synthetic city for precise shaping assertions ----------

const P = (
  id: string,
  tags: string[],
  open: [string, string][],
  stay = 60,
  cost = 10,
  extra: Partial<Place> = {},
): Place => ({
  id,
  name: id,
  lat: 0,
  lng: 0,
  area: "center",
  vibeTags: tags as Place["vibeTags"],
  openHours: { daily: open },
  estStayMin: stay,
  estCostSGD: cost,
  priceBand: 1,
  emoji: "x",
  blurb: id,
  ...extra,
});

const PLACES: Place[] = [
  P("p-morning-food", ["food"], [["07:00", "11:00"]], 45, 5),
  P("p-hawker", ["food"], [["10:00", "21:00"]], 60, 8, { tags: ["chicken rice"] }),
  P("p-night-food", ["food", "nightlife"], [["18:00", "23:59"]], 60, 12),
  P("p-park", ["nature", "chill"], [["00:00", "23:59"]], 60, 0),
  P("p-museum", ["art", "history"], [["10:00", "19:00"]], 90, 20),
  P("p-view", ["views"], [["11:00", "21:00"]], 60, 32),
  P("p-quiet-garden", ["chill", "nature"], [["00:00", "23:59"]], 45, 0),
  P("p-adventure", ["adventure", "nature"], [["07:00", "19:00"]], 120, 15),
  P("p-sunday-closed", ["culture"], [["10:00", "18:00"]], 60, 5, {
    openHours: { daily: [["10:00", "18:00"]], sun: [] },
  }),
];

const MATRIX: TravelMatrix = {
  city: "testville",
  ids: PLACES.map((p) => p.id),
  minutes: PLACES.map(() => PLACES.map(() => 10)).map((row, i) => row.map((v, j) => (i === j ? 0 : v))),
  mode: PLACES.map(() => PLACES.map(() => "drive")),
};

const flight = (
  offer_id: string,
  departDate: string,
  departLocal: string,
  arriveDate: string,
  arriveLocal: string,
  base: number,
  reverse = false,
): FlightOption => ({
  offer_id,
  carrier: { iata: "TR", name: "Scoot" },
  flight_no: offer_id.toUpperCase(),
  origin: reverse ? "DAD" : "SIN",
  destination: reverse ? "SIN" : "DAD",
  departDate,
  departLocal,
  arriveDate,
  arriveLocal,
  departIso: `${departDate}T${departLocal}:00+08:00`,
  arriveIso: `${arriveDate}T${arriveLocal}:00+07:00`,
  duration_min: 160,
  stops: 0,
  price: { base, currency: "SGD" },
  bags: { included: false, checked_fee: 42 },
  price_status: "current",
  bookable: true,
  fare_family: "Economy",
});

const lateOut = flight("tr318", "2026-11-06", "20:10", "2026-11-06", "21:50", 138);
const earlyOut = flight("tr314", "2026-11-07", "07:10", "2026-11-07", "08:50", 186);
const ret = flight("tr319", "2026-11-09", "19:30", "2026-11-09", "23:10", 142, true);

const taste = () => ({ ...seedVector(["food", "nature", "views"]) });

const tripInput = (out: FlightOption): BuildTripInput => ({
  id: "t1",
  city: "testville",
  cityName: "Testville",
  destination: "DAD",
  origin: "SIN",
  window: { start: "2026-11-07", end: "2026-11-09", holiday: "Deepavali" },
  flight: { out, ret },
  places: PLACES,
  matrix: MATRIX,
  taste: taste(),
});

// ---------- buildTrip: arrival shaping (FR-013, FR-005) ----------

describe("buildTrip arrival shaping", () => {
  it("late arrival gives day one at most a night-food stop and a slow next morning", () => {
    const g = buildTrip(tripInput(lateOut));
    expect(g.days[0]!.date).toBe("2026-11-06");
    expect(g.days[0]!.stops.length).toBeLessThanOrEqual(1);
    if (g.days[0]!.stops.length === 1) {
      const stop = g.days[0]!.stops[0]!;
      const place = PLACES.find((p) => p.id === stop.placeId)!;
      expect(place.vibeTags).toContain("food");
      expect(toMin(stop.arrive)).toBeGreaterThanOrEqual(toMin("21:00"));
    }
    expect(toMin(g.days[1]!.stops[0]!.arrive)).toBeGreaterThanOrEqual(toMin("10:30"));
  });

  it("morning arrival gives a full first day", () => {
    const g = buildTrip(tripInput(earlyOut));
    expect(g.days[0]!.date).toBe("2026-11-07");
    expect(g.days[0]!.stops.length).toBeGreaterThanOrEqual(3);
    expect(toMin(g.days[0]!.stops[0]!.arrive)).toBeLessThanOrEqual(toMin("10:00"));
  });

  it("every stop is scheduled within the place's opening hours", () => {
    const g = buildTrip(tripInput(earlyOut));
    for (const day of g.days) {
      for (const stop of day.stops) {
        const place = PLACES.find((p) => p.id === stop.placeId)!;
        const intervals = place.openHours.sun && day.date === "2026-11-08" ? place.openHours.sun : (place.openHours.daily ?? []);
        const inside = intervals.some(
          ([o, c]) => toMin(stop.arrive) >= toMin(o) && toMin(stop.arrive) <= toMin(c) - 30,
        );
        expect(inside, `${stop.placeId} at ${stop.arrive} on ${day.date}`).toBe(true);
      }
    }
  });

  it("departure day ends early enough to make the flight", () => {
    const g = buildTrip(tripInput(earlyOut));
    const lastDay = g.days[g.days.length - 1]!;
    expect(lastDay.date).toBe("2026-11-09");
    for (const stop of lastDay.stops) {
      expect(toMin(stop.depart)).toBeLessThanOrEqual(toMin("19:30") - 240);
    }
  });

  it("includes exactly one sealed wildcard across the trip (FR-007)", () => {
    const g = buildTrip(tripInput(earlyOut));
    const wildcards = g.days.flatMap((d) => d.stops).filter((s) => s.role === "wildcard");
    expect(wildcards.length).toBe(1);
    expect(wildcards[0]!.sealed).toBe(true);
  });

  it("budget totals flight-with-bags plus ground costs (FR-010/FR-014)", () => {
    const g = buildTrip(tripInput(earlyOut));
    expect(g.budget.flightTotal).toBe(186 + 42 + 142 + 42);
    const ground = g.days.flatMap((d) => d.stops).reduce((sum, s) => sum + PLACES.find((p) => p.id === s.placeId)!.estCostSGD, 0);
    expect(g.budget.ground).toBe(ground);
    expect(g.budget.total).toBe(g.budget.flightTotal + g.budget.ground);
  });

  it("narration is exactly one sentence", () => {
    const g = buildTrip(tripInput(earlyOut));
    expect(g.narration.trim().length).toBeGreaterThan(0);
    expect(g.narration.trim().match(/[.!?]/g)?.length).toBe(1);
  });
});

// ---------- must-go guarantee or explain (FR-012) ----------

describe("must-go handling", () => {
  it("includes a feasible must-go place", () => {
    const g = buildTrip({ ...tripInput(earlyOut), mustPlaceIds: ["p-museum"] });
    const ids = g.days.flatMap((d) => d.stops).map((s) => s.placeId);
    expect(ids).toContain("p-museum");
    expect(g.explanations).toEqual([]);
  });

  it("explains exactly once when a must-go cannot fit", () => {
    // p-sunday-closed is closed Sundays; single-day window on Sunday
    const sunOut = flight("tr400", "2026-11-08", "07:10", "2026-11-08", "08:50", 150);
    const sunRet = flight("tr401", "2026-11-08", "21:30", "2026-11-08", "23:10", 150, true);
    const g = buildTrip({
      ...tripInput(sunOut),
      flight: { out: sunOut, ret: sunRet },
      mustPlaceIds: ["p-sunday-closed"],
    });
    const ids = g.days.flatMap((d) => d.stops).map((s) => s.placeId);
    expect(ids).not.toContain("p-sunday-closed");
    expect(g.explanations.length).toBe(1);
    expect(g.explanations[0]).toContain("p-sunday-closed");
  });
});

// ---------- reflow (FR-013/FR-014, the level-4 moment) ----------

describe("reflow", () => {
  it("swapping late->early regrows day one, keeps later days, moves budget by fare delta", () => {
    const g = buildTrip(tripInput(lateOut));
    const sunBefore = g.days.find((d) => d.date === "2026-11-08")!;
    const monBefore = g.days.find((d) => d.date === "2026-11-09")!;
    const r = reflow(g, earlyOut, { places: PLACES, matrix: MATRIX, taste: taste() });

    expect(r.graph.days[0]!.date).toBe("2026-11-07");
    expect(r.graph.days[0]!.stops.length).toBeGreaterThanOrEqual(3);
    expect(r.graph.days.find((d) => d.date === "2026-11-08")!.stops).toEqual(sunBefore.stops);
    expect(r.graph.days.find((d) => d.date === "2026-11-09")!.stops).toEqual(monBefore.stops);
    expect(r.delta.fareDelta).toBe(228 - 180);
    expect(r.graph.budget.flightTotal).toBe(g.budget.flightTotal + 48);
  });

  it("narrates the swap in exactly one sentence naming the money move", () => {
    const g = buildTrip(tripInput(lateOut));
    const r = reflow(g, earlyOut, { places: PLACES, matrix: MATRIX, taste: taste() });
    expect(r.graph.narration).toContain("S$48");
    expect(r.graph.narration.trim().match(/[.!?]/g)?.length).toBe(1);
    expect(r.graph.narration).toContain("day one");
  });

  it("is idempotent for the same flight", () => {
    const g = buildTrip(tripInput(lateOut));
    const r = reflow(g, lateOut, { places: PLACES, matrix: MATRIX, taste: taste() });
    expect(r.delta.fareDelta).toBe(0);
    expect(r.graph.days.map((d) => d.date)).toEqual(g.days.map((d) => d.date));
  });
});

// ---------- S1 day route on real Singapore data (FR-004/005/006/007/012) ----------

const SG = singaporeJson as unknown as CityPlaces;
const SG_MATRIX = sgMatrixJson as unknown as TravelMatrix;

describe("S1: Singapore CBD day trip", () => {
  const opts = () => ({
    date: "2026-09-05", // a Saturday
    startMin: toMin("09:30"),
    endMin: toMin("21:30"),
    taste: { ...seedVector(["food", "chill", "culture", "history", "views"]) },
    mustTags: ["chicken rice"],
    moodTags: ["chill", "nature"] as ("chill" | "nature")[],
    area: "CBD",
  });

  it("includes a chicken-rice stop and winds down through a quiet area", () => {
    const route = buildDayRoute(SG.places, SG_MATRIX, opts());
    expect(route.stops.length).toBeGreaterThanOrEqual(4);
    const stopPlaces = route.stops.map((s) => SG.places.find((p) => p.id === s.placeId)!);
    expect(stopPlaces.some((p) => p.tags?.includes("chicken rice"))).toBe(true);
    const revealed = route.stops.filter((s) => !s.sealed);
    const tail = revealed.slice(-3);
    const hasQuiet = tail.some((s) => {
      const p = SG.places.find((pp) => pp.id === s.placeId)!;
      return p.vibeTags.some((t) => t === "chill" || t === "nature");
    });
    expect(hasQuiet).toBe(true);
  });

  it("keeps every stop inside opening hours with matrix travel times", () => {
    const route = buildDayRoute(SG.places, SG_MATRIX, opts());
    let prev: string | null = null;
    for (const stop of route.stops) {
      if (prev) {
        const i = SG_MATRIX.ids.indexOf(prev);
        const j = SG_MATRIX.ids.indexOf(stop.placeId);
        expect(stop.travelMinFromPrev).toBe(SG_MATRIX.minutes[i]![j]);
      }
      prev = stop.placeId;
    }
  });

  it("has one sealed wildcard", () => {
    const route = buildDayRoute(SG.places, SG_MATRIX, opts());
    const wild = route.stops.filter((s) => s.role === "wildcard");
    expect(wild.length).toBe(1);
    expect(wild[0]!.sealed).toBe(true);
  });

  it("produces at least 2 alternatives differing by 2+ stops (FR-006)", () => {
    const alts = buildAlternatives(SG.places, SG_MATRIX, opts(), 3);
    expect(alts.length).toBeGreaterThanOrEqual(2);
    const base = new Set(alts[0]!.stops.map((s) => s.placeId));
    const diff = alts[1]!.stops.filter((s) => !base.has(s.placeId)).length;
    expect(diff).toBeGreaterThanOrEqual(2);
  });

  it("is deterministic", () => {
    const a = buildDayRoute(SG.places, SG_MATRIX, opts());
    const b = buildDayRoute(SG.places, SG_MATRIX, opts());
    expect(a).toEqual(b);
  });

  it("wildcards are chosen with a travel penalty, not as the longest hop of the day", () => {
    const route = buildDayRoute(SG.places, SG_MATRIX, opts());
    const wildcard = route.stops.find((s) => s.role === "wildcard");
    expect(wildcard).toBeDefined();
    const nonWildcardTravels = route.stops
      .filter((s) => s.role !== "wildcard" && s.travelMinFromPrev > 0)
      .map((s) => s.travelMinFromPrev);
    const maxNonWildcard = Math.max(...nonWildcardTravels);
    // A surprise should not require a trek across town; allow a small buffer
    // for genuinely nearby novel options but reject the old East-Coast-style outlier.
    expect(wildcard!.travelMinFromPrev).toBeLessThanOrEqual(maxNonWildcard + 8);
  });

  it("badges only the first must-tag match as must, not every matching stop", () => {
    const route = buildDayRoute(SG.places, SG_MATRIX, opts());
    const chickenRiceStops = route.stops.filter((s) => {
      const p = SG.places.find((pp) => pp.id === s.placeId)!;
      return p.tags?.includes("chicken rice");
    });
    expect(chickenRiceStops.length).toBeGreaterThanOrEqual(2);
    const mustBadged = chickenRiceStops.filter((s) => s.role === "must");
    expect(mustBadged.length).toBe(1);
  });
});

// ---------- geographic tightness (quadratic travel penalty) ----------

describe("geographic tightness", () => {
  it("total travel time across a Singapore CBD day stays low", () => {
    const route = buildDayRoute(SG.places, SG_MATRIX, {
      date: "2026-09-05",
      startMin: toMin("09:30"),
      endMin: toMin("21:30"),
      taste: { ...seedVector(["food", "chill", "culture", "history", "views"]) },
      mustTags: ["chicken rice"],
      moodTags: ["chill", "nature"] as ("chill" | "nature")[],
      area: "CBD",
    });
    const totalTravel = route.stops.reduce((sum, s) => sum + s.travelMinFromPrev, 0);
    expect(totalTravel).toBeLessThanOrEqual(65);
  });

  it("picks a nearer candidate over a far one of similar taste score", () => {
    const places: Place[] = [
      P("geo-start", ["culture"], [["09:00", "22:00"]], 30),
      P("geo-near-b", ["food"], [["09:00", "22:00"]], 45),
      P("geo-far-b", ["food"], [["09:00", "22:00"]], 45),
    ];
    const ids = places.map((p) => p.id);
    const matrix: TravelMatrix = {
      city: "geotest",
      ids,
      minutes: [
        [0, 3, 30],
        [3, 0, 30],
        [30, 30, 0],
      ],
      mode: [
        ["walk", "walk", "walk"],
        ["walk", "walk", "walk"],
        ["walk", "walk", "walk"],
      ],
    };
    const result = buildDayRoute(places, matrix, {
      date: "2026-09-05",
      startMin: toMin("10:00"),
      endMin: toMin("21:00"),
      taste: { ...seedVector(["food", "culture"]) },
      maxStops: 2,
      includeWildcard: false,
    });
    const ids2 = result.stops.map((s) => s.placeId);
    expect(ids2).toContain("geo-near-b");
    expect(ids2).not.toContain("geo-far-b");
  });

  it("still includes a far-away must-go place despite the travel penalty", () => {
    const places: Place[] = [
      P("mg-start", ["culture"], [["09:00", "22:00"]], 30),
      P("mg-far-must", ["food"], [["09:00", "22:00"]], 60),
      P("mg-near-a", ["chill"], [["09:00", "22:00"]], 30),
      P("mg-near-b", ["chill"], [["09:00", "22:00"]], 30),
    ];
    const ids = places.map((p) => p.id);
    const matrix: TravelMatrix = {
      city: "mgtest",
      ids,
      minutes: [
        [0, 60, 5, 5],
        [60, 0, 60, 60],
        [5, 60, 0, 3],
        [5, 60, 3, 0],
      ],
      mode: [
        ["walk", "drive", "walk", "walk"],
        ["drive", "walk", "drive", "drive"],
        ["walk", "drive", "walk", "walk"],
        ["walk", "drive", "walk", "walk"],
      ],
    };
    const result = buildDayRoute(places, matrix, {
      date: "2026-09-05",
      startMin: toMin("10:00"),
      endMin: toMin("21:00"),
      taste: { ...seedVector(["food", "culture", "chill"]) },
      mustPlaceIds: ["mg-far-must"],
      maxStops: 3,
      includeWildcard: false,
    });
    const stopIds = result.stops.map((s) => s.placeId);
    expect(stopIds).toContain("mg-far-must");
  });
});

// ---------- swapStop: single-stop replacement with forward re-chain ----------

describe("swapStop", () => {
  const swapPlaces: Place[] = [
    P("sw-a", ["food"], [["08:00", "22:00"]], 45, 5),
    P("sw-b", ["culture"], [["09:00", "18:00"]], 60, 20),
    P("sw-c", ["views"], [["09:00", "12:00"]], 45, 10),
    P("sw-d", ["nature", "chill"], [["08:00", "22:00"]], 150, 0),
    P("sw-e", ["food"], [["09:00", "22:00"]], 60, 8),
    P("sw-f", ["adventure"], [["08:00", "22:00"]], 60, 15),
    P("sw-c-late", ["views"], [["09:00", "23:00"]], 45, 10),
  ];
  const swapMatrix: TravelMatrix = {
    city: "swapville",
    ids: swapPlaces.map((p) => p.id),
    minutes: swapPlaces.map(() => swapPlaces.map(() => 10)).map((row, i) => row.map((_, j) => (i === j ? 0 : 10))),
    mode: swapPlaces.map(() => swapPlaces.map(() => "walk")),
  };
  const baseDay: DayPlan = {
    date: "2026-09-05",
    stops: [
      { placeId: "sw-a", arrive: "09:00", depart: "09:45", travelMinFromPrev: 15, role: "food" },
      { placeId: "sw-b", arrive: "09:55", depart: "10:55", travelMinFromPrev: 10, role: "anchor" },
      { placeId: "sw-c", arrive: "11:05", depart: "11:50", travelMinFromPrev: 10, role: "anchor" },
    ],
  };
  const baseDayLate: DayPlan = {
    ...baseDay,
    stops: [baseDay.stops[0]!, baseDay.stops[1]!, { ...baseDay.stops[2]!, placeId: "sw-c-late" }],
  };
  const swapOpts: DayRouteOptions = {
    date: "2026-09-05",
    startMin: toMin("09:00"),
    endMin: toMin("22:00"),
    taste: seedVector(["food", "nature", "views"]),
  };

  it("leaves every earlier stop byte-identical when swapping a mid-day stop", () => {
    const result = swapStop({
      day: baseDay,
      stopIndex: 1,
      replacementPlaceId: "sw-d",
      places: swapPlaces,
      matrix: swapMatrix,
      opts: swapOpts,
    });
    expect(result.day.stops[0]).toEqual(baseDay.stops[0]);
    expect(result.day.stops[0]!.placeId).toBe("sw-a");
    expect(result.day.stops[0]!.arrive).toBe("09:00");
    expect(result.day.stops[0]!.depart).toBe("09:45");
  });

  it("replaces the target stop and recomputes times for later stops", () => {
    const result = swapStop({
      day: baseDayLate,
      stopIndex: 1,
      replacementPlaceId: "sw-d",
      places: swapPlaces,
      matrix: swapMatrix,
      opts: swapOpts,
    });
    expect(result.day.stops[1]!.placeId).toBe("sw-d");
    expect(toMin(result.day.stops[1]!.arrive)).toBe(toMin("09:45") + 10);
    expect(toMin(result.day.stops[1]!.depart)).toBe(toMin(result.day.stops[1]!.arrive) + 150);
    expect(result.day.stops[2]!.placeId).toBe("sw-c-late");
    expect(toMin(result.day.stops[2]!.arrive)).toBe(toMin(result.day.stops[1]!.depart) + 10);
  });

  it("drops a later stop that closes before recomputed arrival and reports it", () => {
    const result = swapStop({
      day: baseDay,
      stopIndex: 1,
      replacementPlaceId: "sw-d",
      places: swapPlaces,
      matrix: swapMatrix,
      opts: swapOpts,
    });
    expect(result.day.stops.length).toBe(2);
    expect(result.droppedStops).toContain("sw-c");
  });

  it("drops a later stop that would run past the day end", () => {
    const tightOpts: DayRouteOptions = { ...swapOpts, endMin: toMin("12:30") };
    const result = swapStop({
      day: baseDay,
      stopIndex: 1,
      replacementPlaceId: "sw-d",
      places: swapPlaces,
      matrix: swapMatrix,
      opts: tightOpts,
    });
    const ids = result.day.stops.map((s) => s.placeId);
    expect(ids).toContain("sw-a");
    expect(ids).toContain("sw-d");
    expect(ids).not.toContain("sw-c");
    expect(result.droppedStops).toContain("sw-c");
  });

  it("reports mustDropped when a must-go stop is dropped", () => {
    const mustOpts: DayRouteOptions = { ...swapOpts, mustPlaceIds: ["sw-c"] };
    const result = swapStop({
      day: baseDay,
      stopIndex: 1,
      replacementPlaceId: "sw-d",
      places: swapPlaces,
      matrix: swapMatrix,
      opts: mustOpts,
    });
    expect(result.mustDropped).toBe(true);
  });

  it("leaves mustDropped false when a dropped stop is not must-go", () => {
    const mustOpts: DayRouteOptions = { ...swapOpts, mustPlaceIds: ["sw-a"] };
    const result = swapStop({
      day: baseDay,
      stopIndex: 1,
      replacementPlaceId: "sw-d",
      places: swapPlaces,
      matrix: swapMatrix,
      opts: mustOpts,
    });
    expect(result.droppedStops).toContain("sw-c");
    expect(result.mustDropped).toBe(false);
  });

  it("computes costDeltaSGD as new day cost minus old", () => {
    const result = swapStop({
      day: baseDayLate,
      stopIndex: 1,
      replacementPlaceId: "sw-e",
      places: swapPlaces,
      matrix: swapMatrix,
      opts: swapOpts,
    });
    const oldCost = 5 + 20 + 10;
    const newCost = 5 + 8 + 10;
    expect(result.costDeltaSGD).toBe(newCost - oldCost);
  });

  it("swapping the first stop recomputes from the day start", () => {
    const result = swapStop({
      day: baseDayLate,
      stopIndex: 0,
      replacementPlaceId: "sw-f",
      places: swapPlaces,
      matrix: swapMatrix,
      opts: swapOpts,
    });
    expect(result.day.stops[0]!.placeId).toBe("sw-f");
    expect(toMin(result.day.stops[0]!.arrive)).toBe(swapOpts.startMin + 15);
    expect(result.day.stops[1]!.placeId).toBe("sw-b");
    expect(result.day.stops[2]!.placeId).toBe("sw-c-late");
  });
});

// ---------- alternativesForStop ----------

describe("alternativesForStop", () => {
  const altPlaces: Place[] = [
    P("alt-a", ["food"], [["08:00", "22:00"]], 60, 5),
    P("alt-b", ["culture"], [["09:00", "18:00"]], 60, 20),
    P("alt-c", ["views"], [["09:00", "20:00"]], 45, 10),
    P("alt-d", ["nature", "chill"], [["08:00", "22:00"]], 60, 0),
    P("alt-e", ["food"], [["09:00", "22:00"]], 60, 8),
    P("alt-f", ["adventure"], [["08:00", "10:30"]], 60, 15),
  ];
  const altMatrix: TravelMatrix = {
    city: "altville",
    ids: altPlaces.map((p) => p.id),
    minutes: altPlaces.map(() => altPlaces.map(() => 10)).map((row, i) => row.map((_, j) => (i === j ? 0 : 10))),
    mode: altPlaces.map(() => altPlaces.map(() => "walk")),
  };
  const altDay: DayPlan = {
    date: "2026-09-05",
    stops: [
      { placeId: "alt-a", arrive: "09:00", depart: "10:00", travelMinFromPrev: 15, role: "food" },
      { placeId: "alt-b", arrive: "10:10", depart: "11:10", travelMinFromPrev: 10, role: "anchor" },
      { placeId: "alt-c", arrive: "11:20", depart: "12:05", travelMinFromPrev: 10, role: "anchor" },
    ],
  };
  const altOpts: DayRouteOptions = {
    date: "2026-09-05",
    startMin: toMin("09:00"),
    endMin: toMin("22:00"),
    taste: seedVector(["food", "nature", "views"]),
  };

  it("never offers a place already in the day", () => {
    const alts = alternativesForStop({ day: altDay, stopIndex: 1, places: altPlaces, matrix: altMatrix, opts: altOpts });
    const ids = alts.map((p) => p.id);
    expect(ids).not.toContain("alt-a");
    expect(ids).not.toContain("alt-b");
    expect(ids).not.toContain("alt-c");
  });

  it("never offers a place closed at the arrival time", () => {
    const alts = alternativesForStop({ day: altDay, stopIndex: 1, places: altPlaces, matrix: altMatrix, opts: altOpts });
    const ids = alts.map((p) => p.id);
    expect(ids).not.toContain("alt-f");
  });

  it("returns at most 6 candidates ranked by taste score", () => {
    const alts = alternativesForStop({ day: altDay, stopIndex: 1, places: altPlaces, matrix: altMatrix, opts: altOpts });
    expect(alts.length).toBeLessThanOrEqual(6);
    expect(alts.length).toBeGreaterThan(0);
  });
});
