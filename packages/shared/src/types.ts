export const VIBE_TAGS = [
  "food",
  "coffee",
  "nature",
  "culture",
  "nightlife",
  "shopping",
  "adventure",
  "chill",
  "art",
  "history",
  "beach",
  "views",
] as const;

export type VibeTag = (typeof VIBE_TAGS)[number];

export type TasteVector = Record<VibeTag, number>;

export type Interval = [string, string];

export interface OpenHours {
  daily?: Interval[];
  mon?: Interval[];
  tue?: Interval[];
  wed?: Interval[];
  thu?: Interval[];
  fri?: Interval[];
  sat?: Interval[];
  sun?: Interval[];
}

export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  area: string;
  vibeTags: VibeTag[];
  openHours: OpenHours;
  estStayMin: number;
  estCostSGD: number;
  priceBand: 1 | 2 | 3;
  emoji: string;
  blurb: string;
  tags?: string[];
}

export interface CityPlaces {
  city: string;
  cityName: string;
  country: string;
  airport: string;
  center: { lat: number; lng: number };
  provenance?: string;
  places: Place[];
}

export interface TravelMatrix {
  city: string;
  ids: string[];
  minutes: number[][];
  mode: string[][];
}

export interface DeckCard {
  id: string;
  placeId?: string;
  title: string;
  emoji: string;
  vibeTags: VibeTag[];
  subtitle?: string;
}

export type SwipeAction = "like" | "pass" | "mustgo";

export interface TasteState {
  vector: TasteVector;
  mustGo: string[];
  swipeCount: number;
  history: Array<{ vector: TasteVector; mustGo: string[] }>;
}

export interface FlightOption {
  offer_id: string;
  carrier: { iata: string; name: string };
  flight_no: string;
  origin: string;
  destination: string;
  departDate: string;
  departLocal: string;
  arriveDate: string;
  arriveLocal: string;
  departIso: string;
  arriveIso: string;
  duration_min: number;
  stops: number;
  price: { base: number; currency: string };
  bags: { included: boolean; checked_fee: number };
  price_status: "current" | "reference";
  bookable: boolean;
  fare_family: string;
}

export type StopRole = "anchor" | "food" | "quiet" | "wildcard" | "must";

export interface StopNode {
  placeId: string;
  arrive: string;
  depart: string;
  travelMinFromPrev: number;
  role: StopRole;
  sealed?: boolean;
}

export interface DayPlan {
  date: string;
  stops: StopNode[];
}

export interface TripBudget {
  flightTotal: number;
  ground: number;
  total: number;
  currency: string;
}

export interface TripGraph {
  id: string;
  city: string;
  origin: string;
  destination: string;
  window: { start: string; end: string; holiday?: string };
  flight: { out: FlightOption; ret: FlightOption };
  days: DayPlan[];
  budget: TripBudget;
  narration: string;
  explanations: string[];
}

export interface Holiday {
  name: string;
  date: string;
  observed?: string;
}

export interface LongWeekend {
  holiday: string;
  start: string;
  end: string;
  nights: number;
}

export interface FareSnapshotEntry {
  origin: string;
  destination: string;
  depart: string;
  offer: FlightOption;
  fetchedAt: string;
  request_id: string;
  mode: "fixture" | "cli";
}
