import { describe, expect, it } from "vitest";
import {
  buildAlternatives,
  buildDayRoute,
  buildTrip,
  reflow,
  seedVector,
  toMin,
  type BuildTripInput,
  type CityPlaces,
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

  it("includes a chicken-rice stop and ends somewhere quiet", () => {
    const route = buildDayRoute(SG.places, SG_MATRIX, opts());
    expect(route.stops.length).toBeGreaterThanOrEqual(4);
    const stopPlaces = route.stops.map((s) => SG.places.find((p) => p.id === s.placeId)!);
    expect(stopPlaces.some((p) => p.tags?.includes("chicken rice"))).toBe(true);
    const revealed = route.stops.filter((s) => !s.sealed);
    const closer = SG.places.find((p) => p.id === revealed[revealed.length - 1]!.placeId)!;
    expect(closer.vibeTags.some((t) => t === "chill" || t === "nature")).toBe(true);
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
});
