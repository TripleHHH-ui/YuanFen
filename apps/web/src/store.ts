import { create } from "zustand";
import {
  api,
  type AlertResult,
  type Card,
  type PlanResult,
  type TasteSummary,
  type TripView,
} from "./api";

export type Phase = "vibes" | "deck" | "home" | "trip";

interface YuanFenState {
  phase: Phase;
  mode: string;
  vibes: string[];
  allVibes: string[];
  summary: TasteSummary | null;
  deck: Card[];
  deckIndex: number;
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
  sendChat(text: string): Promise<void>;
  setAlt(i: number): void;
  openAlert(open: boolean): void;
  revealWildcardDeal(): void;
  expandDeal(destination: string): Promise<void>;
  setTripDay(i: number): void;
  swapFlight(offerId: string): Promise<void>;
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

  async sendChat(text) {
    set({ planLoading: true });
    try {
      const plan = await api.planChat(text);
      set({ plan, planAlt: 0, planLoading: false });
    } catch (e) {
      set({ planLoading: false, error: String(e instanceof Error ? e.message : e) });
    }
  },

  setAlt(i) {
    const n = get().plan?.alternatives?.length ?? 0;
    if (n) set({ planAlt: ((i % n) + n) % n });
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
    set({ phase: "home", trip: null, swapNarration: null, swapDelta: null });
  },

  clearError() {
    set({ error: null });
  },
}));
