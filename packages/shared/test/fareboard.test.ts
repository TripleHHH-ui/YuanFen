import { describe, expect, it } from "vitest";
import {
  emptyVector,
  fareMoment,
  rankHand,
  unexpectedness,
  type DestinationProfile,
  type DistressSignal,
  type FareSnapshotEntry,
  type FlightOption,
} from "../src/index.js";

const offer = (
  dest: string,
  base: number,
  bag: number,
  distress?: Partial<DistressSignal>,
): FlightOption => ({
  offer_id: `o-${dest}-${base}`,
  carrier: { iata: "TR", name: "Scoot" },
  flight_no: "TR1",
  origin: "SIN",
  destination: dest,
  departDate: "2026-11-06",
  departLocal: "18:00",
  arriveDate: "2026-11-06",
  arriveLocal: "20:00",
  departIso: "2026-11-06T18:00:00+08:00",
  arriveIso: "2026-11-06T20:00:00+08:00",
  duration_min: 120,
  stops: 0,
  price: { base, currency: "SGD" },
  bags: { included: false, checked_fee: bag },
  price_status: "current",
  bookable: true,
  fare_family: "Economy",
  ...distress,
});

const entry = (
  dest: string,
  base: number,
  bag: number,
  distress?: Partial<DistressSignal>,
): FareSnapshotEntry => ({
  origin: "SIN",
  destination: dest,
  depart: "2026-11-06",
  offer: offer(dest, base, bag, distress),
  fetchedAt: "2026-08-24T02:00:00+08:00",
  request_id: `rq-${dest}`,
  mode: "fixture",
});

const DEFAULT_DISTRESS: Partial<DistressSignal> = {
  seatCount: 7,
  familySpreadPct: 0.15,
  refundable: false,
  changeable: false,
};

const PROFILES: Record<string, DestinationProfile> = {
  DAD: { iata: "DAD", cityName: "Da Nang", city: "da-nang", tags: ["beach", "food", "nature", "views"], hasCityFile: true },
  DPS: { iata: "DPS", cityName: "Bali", city: "bali", tags: ["beach", "culture", "nature", "chill"], hasCityFile: true },
  CNX: { iata: "CNX", cityName: "Chiang Mai", city: "chiang-mai", tags: ["culture", "food", "nature", "history"], hasCityFile: true },
  KCH: { iata: "KCH", cityName: "Kuching", city: "kuching", tags: ["nature", "adventure", "culture"], hasCityFile: true },
  KUL: { iata: "KUL", cityName: "Kuala Lumpur", city: "kuala-lumpur", tags: ["food", "shopping", "culture"], hasCityFile: false },
  PEN: { iata: "PEN", cityName: "Penang", city: "penang", tags: ["food", "culture", "history"], hasCityFile: false },
  BKK: { iata: "BKK", cityName: "Bangkok", city: "bangkok", tags: ["food", "nightlife", "shopping", "culture"], hasCityFile: false },
  HKT: { iata: "HKT", cityName: "Phuket", city: "phuket", tags: ["beach", "nightlife", "chill"], hasCityFile: false },
};

const SNAPSHOTS: FareSnapshotEntry[] = [
  entry("DAD", 138, 42, { seatCount: 5, familySpreadPct: 0.3, refundable: false, changeable: false }),
  entry("DPS", 176, 48, { seatCount: 2, familySpreadPct: 0.5, refundable: false, changeable: false }),
  entry("CNX", 214, 48, { seatCount: 8, familySpreadPct: 0.2, refundable: false, changeable: false }),
  entry("KCH", 96, 38, { seatCount: 6, familySpreadPct: 0.25, refundable: false, changeable: false }),
  entry("KUL", 74, 36, DEFAULT_DISTRESS),
  entry("PEN", 118, 40, DEFAULT_DISTRESS),
  entry("BKK", 152, 44, DEFAULT_DISTRESS),
  entry("HKT", 168, 44, DEFAULT_DISTRESS),
];

const taste = () => ({ ...emptyVector(), food: 0.9, nature: 0.8, beach: 0.5 });

describe("rankHand (FR-009, FR-010, FR-021, FR-022)", () => {
  it("ranks the open hand by the taste/fare-moment/unexpectedness blend", () => {
    const hand = rankHand(SNAPSHOTS, taste(), PROFILES);
    expect(hand.top.map((d) => d.destination)).toEqual(["DPS", "DAD", "KCH"]);
  });

  it("headline price is total with checked bag", () => {
    const hand = rankHand(SNAPSHOTS, taste(), PROFILES);
    const dps = hand.top[0]!;
    expect(dps.totalWithBag).toBe(176 + 48);
  });

  it("wildcard is the most-unexpected remaining destination with full trip data, sealed", () => {
    const hand = rankHand(SNAPSHOTS, taste(), PROFILES);
    expect(hand.wildcard.destination).toBe("CNX");
    expect(hand.wildcard.sealed).toBe(true);
    expect(hand.wildcard.novelTags).toContain("history");
  });

  it("uses the cheapest total per destination when multiple snapshots exist", () => {
    const withCheaper = [
      ...SNAPSHOTS,
      entry("DAD", 120, 42, { seatCount: 5, familySpreadPct: 0.3, refundable: false, changeable: false }),
    ];
    const hand = rankHand(withCheaper, taste(), PROFILES);
    const dad = hand.top.find((d) => d.destination === "DAD")!;
    expect(dad.totalWithBag).toBe(162);
  });

  it("is deterministic for fixed inputs", () => {
    const a = rankHand(SNAPSHOTS, taste(), PROFILES);
    const b = rankHand(SNAPSHOTS, taste(), PROFILES);
    expect(a).toEqual(b);
  });
});

describe("fareMoment (FR-021)", () => {
  it("returns 0.5 when every sub-signal is absent", () => {
    expect(fareMoment({ refundable: null, changeable: null })).toBe(0.5);
  });

  it("ranks a scarce/restrictive fixture offer above an identically-priced flexible one", () => {
    const profiles: Record<string, DestinationProfile> = {
      SCARCE: { iata: "SCARCE", cityName: "Scarce City", city: "scarce", tags: ["food", "nature"], hasCityFile: true },
      FLEX: { iata: "FLEX", cityName: "Flex City", city: "flex", tags: ["food", "nature"], hasCityFile: true },
      FILL1: { iata: "FILL1", cityName: "Fill One", city: "fill1", tags: ["adventure"], hasCityFile: true },
      FILL2: { iata: "FILL2", cityName: "Fill Two", city: "fill2", tags: ["history"], hasCityFile: true },
    };
    const t = { ...emptyVector(), food: 1, nature: 1 };
    const snapshots: FareSnapshotEntry[] = [
      entry("SCARCE", 100, 20, { seatCount: 2, familySpreadPct: 0.5, refundable: false, changeable: false }),
      entry("FLEX", 100, 20, { seatCount: 20, familySpreadPct: 0, refundable: true, changeable: true }),
      entry("FILL1", 100, 20, DEFAULT_DISTRESS),
      entry("FILL2", 100, 20, DEFAULT_DISTRESS),
    ];
    const hand = rankHand(snapshots, t, profiles);
    expect(hand.top[0]!.destination).toBe("SCARCE");
  });

  it("fixture offers missing distress fields neither crash nor dominate nor starve the ranking", () => {
    const t = { ...emptyVector(), food: 0.9, nature: 0.8 };
    const profiles: Record<string, DestinationProfile> = {
      HIGH: { iata: "HIGH", cityName: "High", city: "high", tags: ["food", "nature"], hasCityFile: true },
      MISSING: { iata: "MISSING", cityName: "Missing", city: "missing", tags: ["food", "nature"], hasCityFile: true },
      LOW: { iata: "LOW", cityName: "Low", city: "low", tags: ["food", "nature"], hasCityFile: true },
      FILL: { iata: "FILL", cityName: "Fill", city: "fill", tags: ["food"], hasCityFile: true },
    };
    const snapshots: FareSnapshotEntry[] = [
      entry("HIGH", 100, 20, { seatCount: 1, familySpreadPct: 0.5, refundable: false, changeable: false }),
      entry("MISSING", 100, 20),
      entry("LOW", 100, 20, { seatCount: 20, familySpreadPct: 0, refundable: true, changeable: true }),
      entry("FILL", 100, 20, { seatCount: 20, familySpreadPct: 0, refundable: true, changeable: true }),
    ];
    const hand = rankHand(snapshots, t, profiles);
    expect(hand.top.map((d) => d.destination)).toEqual(["HIGH", "MISSING", "LOW"]);
  });
});

describe("unexpectedness (FR-022)", () => {
  it("is near 0 for a destination whose tags are all already strongly expressed", () => {
    const t = { ...emptyVector(), food: 1, nature: 1 };
    expect(unexpectedness(t, ["food", "nature"])).toBeCloseTo(0, 5);
  });

  it("is near 1 for a destination whose tags are not strongly expressed", () => {
    const t = { ...emptyVector(), food: 1, nature: 1 };
    expect(unexpectedness(t, ["adventure", "nightlife"])).toBeCloseTo(1, 5);
  });

  it("demotes a destination whose tags are a subset of an already-maxed vector, even when its taste score ties another candidate", () => {
    // adventure is present but not yet strongly expressed, so the fresher set of tags wins.
    const t = { ...emptyVector(), food: 1, nature: 1, adventure: 0.5 };
    const profiles: Record<string, DestinationProfile> = {
      FAMILIAR: { iata: "FAMILIAR", cityName: "Familiar", city: "familiar", tags: ["food", "nature"], hasCityFile: true },
      FRESH: { iata: "FRESH", cityName: "Fresh", city: "fresh", tags: ["food", "nature", "adventure"], hasCityFile: true },
      LOW1: { iata: "LOW1", cityName: "Low One", city: "low1", tags: ["food"], hasCityFile: true },
      LOW2: { iata: "LOW2", cityName: "Low Two", city: "low2", tags: ["nature"], hasCityFile: true },
    };
    const snapshots: FareSnapshotEntry[] = [
      entry("FAMILIAR", 100, 20, DEFAULT_DISTRESS),
      entry("FRESH", 100, 20, DEFAULT_DISTRESS),
      entry("LOW1", 100, 20, { seatCount: 20, familySpreadPct: 0, refundable: true, changeable: true }),
      entry("LOW2", 100, 20, { seatCount: 20, familySpreadPct: 0, refundable: true, changeable: true }),
    ];
    const hand = rankHand(snapshots, t, profiles);
    expect(hand.top[0]!.destination).toBe("FRESH");
  });
});

describe("observed-fare badge (FR-011)", async () => {
  const { showObservedBadge } = await import("../src/index.js");
  const night = (dest: string, day: number, mode: "cli" | "fixture"): FareSnapshotEntry => ({
    ...entry(dest, 150, 40),
    fetchedAt: `2026-08-${String(day).padStart(2, "0")}T02:00:00+08:00`,
    mode,
  });

  it("stays hidden below 7 real nights and shows at 7", () => {
    const six = Array.from({ length: 6 }, (_, i) => night("DAD", i + 1, "cli"));
    expect(showObservedBadge(six, "DAD")).toBe(false);
    const seven = [...six, night("DAD", 7, "cli")];
    expect(showObservedBadge(seven, "DAD")).toBe(true);
  });

  it("fixture-mode snapshots never count toward the badge", () => {
    const fixtures = Array.from({ length: 10 }, (_, i) => night("DAD", i + 1, "fixture"));
    expect(showObservedBadge(fixtures, "DAD")).toBe(false);
  });
});
