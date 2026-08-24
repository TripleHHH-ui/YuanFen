import { describe, expect, it } from "vitest";
import {
  emptyVector,
  rankHand,
  type DestinationProfile,
  type FareSnapshotEntry,
  type FlightOption,
} from "../src/index.js";

const offer = (dest: string, base: number, bag: number): FlightOption => ({
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
});

const entry = (dest: string, base: number, bag: number): FareSnapshotEntry => ({
  origin: "SIN",
  destination: dest,
  depart: "2026-11-06",
  offer: offer(dest, base, bag),
  fetchedAt: "2026-08-24T02:00:00+08:00",
  request_id: `rq-${dest}`,
  mode: "fixture",
});

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
  entry("DAD", 138, 42),
  entry("DPS", 176, 48),
  entry("CNX", 214, 48),
  entry("KCH", 96, 38),
  entry("KUL", 74, 36),
  entry("PEN", 118, 40),
  entry("BKK", 152, 44),
  entry("HKT", 168, 44),
];

const taste = () => ({ ...emptyVector(), food: 0.9, nature: 0.8, beach: 0.5 });

describe("rankHand (FR-009, FR-010)", () => {
  it("returns the 3 highest taste-scoring destinations as the open hand", () => {
    const hand = rankHand(SNAPSHOTS, taste(), PROFILES);
    expect(hand.top.map((d) => d.destination)).toEqual(["DAD", "CNX", "DPS"]);
  });

  it("headline price is total with checked bag", () => {
    const hand = rankHand(SNAPSHOTS, taste(), PROFILES);
    const dad = hand.top[0]!;
    expect(dad.totalWithBag).toBe(138 + 42);
  });

  it("wildcard is the best-ranked remaining destination with full trip data and a novel tag, sealed", () => {
    const hand = rankHand(SNAPSHOTS, taste(), PROFILES);
    expect(hand.wildcard.destination).toBe("KCH");
    expect(hand.wildcard.sealed).toBe(true);
    expect(hand.wildcard.novelTags).toContain("adventure");
  });

  it("uses the cheapest total per destination when multiple snapshots exist", () => {
    const withCheaper = [...SNAPSHOTS, entry("DAD", 120, 42)];
    const hand = rankHand(withCheaper, taste(), PROFILES);
    expect(hand.top[0]!.totalWithBag).toBe(162);
  });

  it("is deterministic for fixed inputs", () => {
    const a = rankHand(SNAPSHOTS, taste(), PROFILES);
    const b = rankHand(SNAPSHOTS, taste(), PROFILES);
    expect(a).toEqual(b);
  });
});
