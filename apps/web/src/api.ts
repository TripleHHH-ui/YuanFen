// Thin typed fetch layer over the YuanFen api (proxied /api -> :8787).

export interface TasteSummary {
  vector: Record<string, number>;
  topTags: string[];
  mustGo: string[];
  swipeCount: number;
  deckSize: number;
  strength: number;
}

export interface Card {
  id: string;
  placeId?: string;
  title: string;
  emoji: string;
  vibeTags: string[];
  subtitle?: string;
}

export interface WireStop {
  placeId: string;
  arrive: string;
  depart: string;
  travelMinFromPrev: number;
  role: string;
  sealed?: boolean;
  place: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    emoji: string;
    blurb: string;
    area: string;
    vibeTags: string[];
    estCostSGD: number;
  } | null;
}

export interface PlanResult {
  intent?: { mustTags: string[]; moodTags: string[]; area?: string };
  error?: string;
  date?: string;
  city?: { id: string; name: string; center: { lat: number; lng: number } };
  alternatives?: Array<{ stops: WireStop[]; explanations: string[] }>;
  narration?: string;
}

export interface Offer {
  offer_id: string;
  carrier: { iata: string; name: string };
  flight_no: string;
  origin: string;
  destination: string;
  departDate: string;
  departLocal: string;
  arriveDate: string;
  arriveLocal: string;
  price: { base: number; currency: string };
  bags: { included: boolean; checked_fee: number };
  totalWithBag?: number;
}

export interface Deal {
  destination: string;
  cityName: string;
  city: string;
  hasCityFile: boolean;
  offer: Offer;
  totalWithBag: number;
  score: number;
  novelTags: string[];
  sealed: boolean;
}

export interface AlertResult {
  weekend: { holiday: string; start: string; end: string; nights: number } | null;
  hand: { top: Deal[]; wildcard: Deal } | null;
  mode: string;
}

export interface TripView {
  graph: {
    id: string;
    city: string;
    destination: string;
    window: { start: string; end: string; holiday?: string };
    flight: { out: Offer; ret: Offer };
    days: Array<{ date: string; stops: WireStop[]; explanations: string[] }>;
    budget: { flightTotal: number; ground: number; total: number; currency: string };
    narration: string;
    explanations: string[];
  };
  cityName: string;
  center: { lat: number; lng: number };
  flightOptions: Offer[];
}

export interface StopAlternative {
  id: string;
  name: string;
  emoji: string;
  vibeTags: string[];
  estCostSGD: number;
  travelMinFromPrev: number;
}

export interface StopSwapResult {
  trip: TripView;
  costDeltaSGD: number;
  travelDeltaMin: number;
  droppedStops: string[];
  mustDropped: boolean;
  narration: string;
}

export interface EvidenceCall {
  request_id: string;
  ts: string;
  op: string;
  env: string;
  mode: string;
  summary: string;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `${res.status}`);
  return body;
}

export const api = {
  vibes: () => req<{ tags: string[]; min: number }>("/api/meta/vibes"),
  mode: () => req<{ mode: string; environment: string }>("/api/meta/mode"),
  deck: () => req<{ cards: Card[] }>("/api/taste/deck"),
  destinationDeck: (destination: string) =>
    req<{ cards: Card[] }>(`/api/taste/deck/${destination}`),
  seed: (tags: string[]) =>
    req<{ ok: boolean; summary: TasteSummary }>("/api/taste/seed", {
      method: "POST",
      body: JSON.stringify({ tags }),
    }),
  swipe: (cardId: string, action: "like" | "pass" | "mustgo", destination?: string) =>
    req<{ done: boolean; summary: TasteSummary }>("/api/taste/swipe", {
      method: "POST",
      body: JSON.stringify({ cardId, action, destination }),
    }),
  undo: (destination?: string) =>
    req<{ summary: TasteSummary }>("/api/taste/undo", {
      method: "POST",
      body: JSON.stringify({ destination }),
    }),
  planChat: (text: string, city?: string) =>
    req<PlanResult>("/api/plan/chat", { method: "POST", body: JSON.stringify({ text, city }) }),
  alert: () => req<AlertResult>("/api/fareboard/alert"),
  createTrip: (destination: string) =>
    req<TripView>("/api/trips", { method: "POST", body: JSON.stringify({ destination }) }),
  swapFlight: (tripId: string, offerId: string) =>
    req<{ trip: TripView; delta: { fareDelta: number }; narration: string }>(
      `/api/trips/${tripId}/swap-flight`,
      { method: "POST", body: JSON.stringify({ offer_id: offerId }) },
    ),
  stopAlternatives: (tripId: string, dayIndex: number, stopIndex: number) =>
    req<{ alternatives: StopAlternative[] }>(
      `/api/trips/${tripId}/day/${dayIndex}/stop/${stopIndex}/alternatives`,
    ),
  swapStop: (tripId: string, dayIndex: number, stopIndex: number, placeId: string) =>
    req<StopSwapResult>(
      `/api/trips/${tripId}/day/${dayIndex}/stop/${stopIndex}/swap`,
      { method: "POST", body: JSON.stringify({ place_id: placeId }) },
    ),
  reveal: (city: string, placeId: string) =>
    req<{ place: NonNullable<WireStop["place"]> }>(`/api/reveal/${city}/${placeId}`),
  verify: (offerId: string) =>
    req<{
      booking_id: string;
      total: number;
      currency: string;
      price_changed: boolean;
      previous_total: number | null;
      environment: string;
      mode: string;
    }>("/api/booking/verify", { method: "POST", body: JSON.stringify({ offer_id: offerId }) }),
  acceptPrice: (bookingId: string) =>
    req<{ accepted: boolean }>("/api/booking/accept-price", {
      method: "POST",
      body: JSON.stringify({ booking_id: bookingId }),
    }),
  order: (bookingId: string, passengers: unknown[]) =>
    req<{
      confirmation_id: string;
      summary: {
        flight_no: string;
        route: string;
        depart: string;
        passenger_masked: string;
        total: number;
        currency: string;
        payment_deadline: string;
      };
    }>("/api/booking/order", {
      method: "POST",
      body: JSON.stringify({ booking_id: bookingId, passengers }),
    }),
  pay: (confirmationId: string, approvedTotal: number) =>
    req<{
      order_no: string;
      pnr: string;
      ticket_numbers: string[];
      ticketing_status: string;
      environment: string;
      mode: string;
    }>("/api/booking/pay", {
      method: "POST",
      body: JSON.stringify({ confirmation_id: confirmationId, approved_total: approvedTotal }),
    }),
  evidence: () =>
    req<{ mode: string; environment: string; calls: EvidenceCall[] }>("/api/evidence"),
};
