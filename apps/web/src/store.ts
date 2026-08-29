import { create } from "zustand";
import {
  alternativesForStop,
  narrateStopSwap,
  swapStop as engineSwapStop,
  toMin,
  type CityPlaces,
  type DayPlan,
  type DayRouteOptions,
  type Place,
  type StopNode,
  type StopRole,
  type TasteVector,
  type TravelMatrix,
} from "@yuanfen/shared";
import {
  api,
  type AlertResult,
  type Card,
  type PlanResult,
  type StopAlternative,
  type TasteSummary,
  type TripView,
  type WireStop,
} from "./api";

export type Phase = "vibes" | "deck" | "home" | "trip";

export interface CityRef {
  id: string;
  name: string;
  center: { lat: number; lng: number };
}

const HOME_CITY: CityRef = {
  id: "singapore",
  name: "Singapore",
  center: { lat: 1.2903, lng: 103.852 },
};

const cityModules = import.meta.glob<{ default: CityPlaces }>("../../../data/places/*.json");
const matrixModules = import.meta.glob<{ default: TravelMatrix }>("../../../data/routing/*.json");

async function loadPlanCityData(city: string): Promise<{ places: Place[]; matrix: TravelMatrix } | null> {
  const placeMod = cityModules[`../../../data/places/${city}.json`];
  const matrixMod = matrixModules[`../../../data/routing/${city}.json`];
  if (!placeMod || !matrixMod) return null;
  const [placesJson, matrixJson] = await Promise.all([placeMod(), matrixMod()]);
  return { places: placesJson.default.places, matrix: matrixJson.default };
}

function planDayOpts(plan: PlanResult, taste: TasteVector): DayRouteOptions | null {
  if (!plan.date) return null;
  return {
    date: plan.date,
    startMin: toMin("09:30"),
    endMin: toMin("21:30"),
    taste,
    mustTags: plan.intent?.mustTags,
    moodTags: plan.intent?.moodTags as DayRouteOptions["moodTags"],
    area: plan.intent?.area,
  };
}

function enrichStops(stops: StopNode[], places: Place[]): WireStop[] {
  return stops.map((s) => {
    const p = places.find((x) => x.id === s.placeId) ?? null;
    return {
      ...s,
      place: p
        ? s.sealed
          ? {
              id: p.id,
              name: "???",
              lat: p.lat,
              lng: p.lng,
              emoji: "🎁",
              blurb: "Sealed wildcard — tap to reveal",
              area: p.area,
              vibeTags: [],
              estCostSGD: p.estCostSGD,
            }
          : {
              id: p.id,
              name: p.name,
              lat: p.lat,
              lng: p.lng,
              emoji: p.emoji,
              blurb: p.blurb,
              area: p.area,
              vibeTags: p.vibeTags,
              estCostSGD: p.estCostSGD,
            }
        : null,
    };
  });
}

function wireStopsToDay(stops: WireStop[], date: string): DayPlan {
  return {
    date,
    stops: stops.map((s) => ({ ...s, role: s.role as StopRole })),
  };
}

interface YuanFenState {
  phase: Phase;
  mode: string;
  vibes: string[];
  allVibes: string[];
  summary: TasteSummary | null;
  deck: Card[];
  deckIndex: number;
  destinationDecks: Record<string, { deck: Card[]; index: number; summary: TasteSummary | null }>;
  currentCity: CityRef;
  plan: PlanResult | null;
  planAlt: number;
  planLoading: boolean;
  alert: AlertResult | null;
  alertOpen: boolean;
  wildcardDealRevealed: boolean;
  trip: TripView | null;
  tripDay: number;
  swapNarration: string | null;
  swapDelta: number | null;
  reflowing: boolean;
  swappingStop: { dayIndex: number; stopIndex: number; alternatives: StopAlternative[] } | null;
  stopSwapDelta: { costDeltaSGD: number; travelDeltaMin: number } | null;
  changedStopId: string | null;
  revealed: Record<string, { name: string; emoji: string; blurb: string }>;
  bookingOffer: string | null;
  evidenceOpen: boolean;
  error: string | null;

  init(): Promise<void>;
  toggleVibe(tag: string): void;
  confirmVibes(): Promise<void>;
  swipe(action: "like" | "pass" | "mustgo"): Promise<void>;
  undo(): Promise<void>;
  finishDeck(): Promise<void>;
  loadDestinationDeck(destination: string): Promise<void>;
  swipeDestination(destination: string, action: "like" | "pass" | "mustgo"): Promise<void>;
  undoDestination(destination: string): Promise<void>;
  sendChat(text: string): Promise<void>;
  setAlt(i: number): void;
  openAlert(open: boolean): void;
  revealWildcardDeal(): void;
  expandDeal(destination: string): Promise<void>;
  setTripDay(i: number): void;
  swapFlight(offerId: string): Promise<void>;
  openStopSwap(dayIndex: number, stopIndex: number): Promise<void>;
  closeStopSwap(): void;
  swapStop(dayIndex: number, stopIndex: number, placeId: string): Promise<void>;
  revealStop(city: string, placeId: string): Promise<void>;
  openBooking(offerId: string | null): void;
  toggleEvidence(): void;
  backHome(): void;
  clearError(): void;
}

export const useStore = create<YuanFenState>((set, get) => ({
  phase: "vibes",
  mode: "fixture",
  vibes: [],
  allVibes: [],
  summary: null,
  deck: [],
  deckIndex: 0,
  destinationDecks: {},
  currentCity: HOME_CITY,
  plan: null,
  planAlt: 0,
  planLoading: false,
  alert: null,
  alertOpen: false,
  wildcardDealRevealed: false,
  trip: null,
  tripDay: 0,
  swapNarration: null,
  swapDelta: null,
  reflowing: false,
  swappingStop: null,
  stopSwapDelta: null,
  changedStopId: null,
  revealed: {},
  bookingOffer: null,
  evidenceOpen: false,
  error: null,

  async init() {
    try {
      const [vibes, mode] = await Promise.all([api.vibes(), api.mode()]);
      set({ allVibes: vibes.tags, mode: mode.mode });
    } catch {
      set({ error: "API offline — start it with `npm run dev`" });
    }
  },

  toggleVibe(tag) {
    const { vibes } = get();
    set({ vibes: vibes.includes(tag) ? vibes.filter((t) => t !== tag) : [...vibes, tag] });
  },

  async confirmVibes() {
    try {
      const [seedRes, deckRes] = await Promise.all([api.seed(get().vibes), api.deck()]);
      set({ summary: seedRes.summary, deck: deckRes.cards, deckIndex: 0, phase: "deck" });
    } catch (e) {
      set({ error: String(e instanceof Error ? e.message : e) });
    }
  },

  async swipe(action) {
    const { deck, deckIndex } = get();
    const card = deck[deckIndex];
    if (!card) return;
    try {
      const res = await api.swipe(card.id, action);
      set({ summary: res.summary, deckIndex: deckIndex + 1 });
      if (res.done || deckIndex + 1 >= deck.length) await get().finishDeck();
    } catch (e) {
      set({ error: String(e instanceof Error ? e.message : e) });
    }
  },

  async undo() {
    const { deckIndex } = get();
    if (deckIndex === 0) return;
    const res = await api.undo();
    set({ summary: res.summary, deckIndex: deckIndex - 1 });
  },

  async finishDeck() {
    set({ phase: "home" });
    // The proactive loop: the fare board is already ranked — the alert lands
    // unprompted a beat after arriving home (S3).
    setTimeout(async () => {
      try {
        const alert = await api.alert();
        set({ alert });
      } catch {
        /* alert stays hidden if the board is empty */
      }
    }, 2500);
  },

  async loadDestinationDeck(destination) {
    const res = await api.destinationDeck(destination);
    set({
      destinationDecks: {
        ...get().destinationDecks,
        [destination]: { deck: res.cards, index: 0, summary: null },
      },
    });
  },

  async swipeDestination(destination, action) {
    const entry = get().destinationDecks[destination];
    if (!entry) return;
    const card = entry.deck[entry.index];
    if (!card) return;
    try {
      const res = await api.swipe(card.id, action, destination);
      set({
        destinationDecks: {
          ...get().destinationDecks,
          [destination]: {
            ...entry,
            index: entry.index + 1,
            summary: res.summary,
          },
        },
      });
    } catch (e) {
      set({ error: String(e instanceof Error ? e.message : e) });
    }
  },

  async undoDestination(destination) {
    const entry = get().destinationDecks[destination];
    if (!entry || entry.index === 0) return;
    try {
      const res = await api.undo(destination);
      set({
        destinationDecks: {
          ...get().destinationDecks,
          [destination]: {
            ...entry,
            index: entry.index - 1,
            summary: res.summary,
          },
        },
      });
    } catch (e) {
      set({ error: String(e instanceof Error ? e.message : e) });
    }
  },

  async sendChat(text) {
    set({ planLoading: true });
    try {
      const plan = await api.planChat(text, get().currentCity.id);
      set({ plan, planAlt: 0, planLoading: false });
    } catch (e) {
      set({ planLoading: false, error: String(e instanceof Error ? e.message : e) });
    }
  },

  setAlt(i) {
    const n = get().plan?.alternatives?.length ?? 0;
    if (!n) return;
    set({
      planAlt: ((i % n) + n) % n,
      swappingStop: null,
      stopSwapDelta: null,
      changedStopId: null,
    });
  },

  openAlert(open) {
    set({ alertOpen: open });
  },

  revealWildcardDeal() {
    set({ wildcardDealRevealed: true });
  },

  async expandDeal(destination) {
    try {
      const trip = await api.createTrip(destination);
      set({ trip, phase: "trip", tripDay: 0, alertOpen: false, swapNarration: null, swapDelta: null });
    } catch (e) {
      set({ error: String(e instanceof Error ? e.message : e) });
    }
  },

  setTripDay(i) {
    set({ tripDay: i });
  },

  async swapFlight(offerId) {
    const { trip } = get();
    if (!trip) return;
    set({ reflowing: true });
    try {
      const res = await api.swapFlight(trip.graph.id, offerId);
      // Let the outgoing day-one stops fade before the new plan cascades in.
      setTimeout(() => {
        set({
          trip: res.trip,
          tripDay: 0,
          swapNarration: res.narration,
          swapDelta: res.delta.fareDelta,
          reflowing: false,
        });
      }, 450);
    } catch (e) {
      set({ reflowing: false, error: String(e instanceof Error ? e.message : e) });
    }
  },

  async openStopSwap(dayIndex, stopIndex) {
    const { trip, plan, summary, planAlt } = get();
    if (trip) {
      try {
        const res = await api.stopAlternatives(trip.graph.id, dayIndex, stopIndex);
        set({ swappingStop: { dayIndex, stopIndex, alternatives: res.alternatives } });
      } catch {
        set({ swappingStop: null });
      }
      return;
    }
    if (!plan?.alternatives || !plan.city || !summary?.vector) {
      set({ swappingStop: null });
      return;
    }
    const data = await loadPlanCityData(plan.city.id);
    const opts = data && planDayOpts(plan, summary.vector as TasteVector);
    const alt = plan.alternatives[planAlt];
    if (!data || !opts || !alt) {
      set({ swappingStop: null });
      return;
    }
    const day = wireStopsToDay(alt.stops, opts.date);
    const prevPlaceId = stopIndex > 0 ? day.stops[stopIndex - 1]!.placeId : null;
    const places = alternativesForStop({ day, stopIndex, places: data.places, matrix: data.matrix, opts });
    set({
      swappingStop: {
        dayIndex,
        stopIndex,
        alternatives: places.map((p) => {
          const i = data.matrix.ids.indexOf(prevPlaceId ?? "");
          const j = data.matrix.ids.indexOf(p.id);
          const travelMin = prevPlaceId ? (data.matrix.minutes[i]?.[j] ?? 15) : 15;
          return {
            id: p.id,
            name: p.name,
            emoji: p.emoji,
            vibeTags: p.vibeTags,
            estCostSGD: p.estCostSGD,
            travelMinFromPrev: travelMin,
          };
        }),
      },
    });
  },

  closeStopSwap() {
    set({ swappingStop: null });
  },

  async swapStop(dayIndex, stopIndex, placeId) {
    const { trip, plan, summary, planAlt } = get();
    set({ swappingStop: null });
    if (trip) {
      try {
        const res = await api.swapStop(trip.graph.id, dayIndex, stopIndex, placeId);
        set({
          trip: res.trip,
          stopSwapDelta: { costDeltaSGD: res.costDeltaSGD, travelDeltaMin: res.travelDeltaMin },
          swapNarration: res.narration,
          changedStopId: placeId,
        });
      } catch (e) {
        set({ error: String(e instanceof Error ? e.message : e) });
      }
      return;
    }
    if (!plan?.alternatives || !plan.city || !summary?.vector) return;
    const data = await loadPlanCityData(plan.city.id);
    const opts = data && planDayOpts(plan, summary.vector as TasteVector);
    const alt = plan.alternatives[planAlt];
    if (!data || !opts || !alt) {
      set({ error: "Could not load city data for this swap." });
      return;
    }
    const day = wireStopsToDay(alt.stops, opts.date);
    const oldPlace = data.places.find((p) => p.id === day.stops[stopIndex]!.placeId);
    const newPlace = data.places.find((p) => p.id === placeId);
    if (!newPlace) {
      set({ error: "Unknown replacement place." });
      return;
    }
    const result = engineSwapStop({ day, stopIndex, replacementPlaceId: placeId, places: data.places, matrix: data.matrix, opts });
    const newStops = enrichStops(result.day.stops, data.places);
    const narration = narrateStopSwap(oldPlace?.name ?? "a stop", newPlace.name, {
      costDeltaSGD: result.costDeltaSGD,
      travelDeltaMin: result.travelDeltaMin,
      droppedStops: result.droppedStops,
    });
    const alternatives = [...plan.alternatives];
    alternatives[planAlt] = { ...alt, stops: newStops };
    set({
      plan: { ...plan, alternatives, narration },
      stopSwapDelta: { costDeltaSGD: result.costDeltaSGD, travelDeltaMin: result.travelDeltaMin },
      changedStopId: placeId,
    });
  },

  async revealStop(city, placeId) {
    try {
      const res = await api.reveal(city, placeId);
      set({
        revealed: {
          ...get().revealed,
          [placeId]: { name: res.place.name, emoji: res.place.emoji, blurb: res.place.blurb },
        },
      });
    } catch {
      /* stays sealed */
    }
  },

  openBooking(offerId) {
    set({ bookingOffer: offerId });
  },

  toggleEvidence() {
    set({ evidenceOpen: !get().evidenceOpen });
  },

  backHome() {
    set({ phase: "home", trip: null, swapNarration: null, swapDelta: null, stopSwapDelta: null, changedStopId: null, swappingStop: null });
  },

  clearError() {
    set({ error: null });
  },
}));
