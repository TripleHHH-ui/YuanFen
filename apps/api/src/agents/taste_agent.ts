import {
  applySwipe,
  initialTasteState,
  seedVector,
  undoSwipe,
  VIBE_TAGS,
  type DeckCard,
  type SwipeAction,
  type TasteState,
  type VibeTag,
} from "@yuanfen/shared";
import { loadCity } from "../data.js";

/**
 * TasteAgent: swipe events -> taste vector (FR-002/FR-003). One in-memory
 * demo profile — account-less start (FR-001); the web client persists its own
 * copy so a refresh reseeds via /api/taste/restore.
 */
const DECK_SIZE = 15;
const MIN_VIBES = 5;

let state: TasteState | null = null;
let deckCache: DeckCard[] | null = null;

export function seedTaste(tags: VibeTag[]): { ok: boolean; error?: string } {
  const valid = tags.filter((t) => (VIBE_TAGS as readonly string[]).includes(t));
  if (valid.length < MIN_VIBES) return { ok: false, error: `Pick at least ${MIN_VIBES} vibes` };
  state = initialTasteState(seedVector(valid));
  return { ok: true };
}

/** Deterministic diverse pick: round-robin across primary vibe tags. */
export function tasteDeck(): DeckCard[] {
  if (deckCache) return deckCache;
  const places = loadCity("singapore").places;
  const buckets = new Map<string, typeof places>();
  for (const p of places) {
    const key = p.vibeTags[0] ?? "chill";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(p);
  }
  const keys = [...buckets.keys()].sort();
  const cards: DeckCard[] = [];
  let round = 0;
  while (cards.length < DECK_SIZE && round < 10) {
    for (const key of keys) {
      const p = buckets.get(key)![round];
      if (p && cards.length < DECK_SIZE) {
        cards.push({
          id: `card-${p.id}`,
          placeId: p.id,
          title: p.name,
          emoji: p.emoji,
          vibeTags: p.vibeTags,
          subtitle: p.blurb,
        });
      }
    }
    round += 1;
  }
  deckCache = cards;
  return cards;
}

export function swipe(cardId: string, action: SwipeAction): { state: TasteState; done: boolean } | { error: string } {
  if (!state) return { error: "Seed vibes first" };
  if (state.swipeCount >= DECK_SIZE) return { state, done: true };
  const card = tasteDeck().find((c) => c.id === cardId);
  if (!card) return { error: `Unknown card ${cardId}` };
  state = applySwipe(state, card, action);
  return { state, done: state.swipeCount >= DECK_SIZE };
}

export function undo(): { state: TasteState } | { error: string } {
  if (!state) return { error: "Seed vibes first" };
  state = undoSwipe(state);
  return { state };
}

export function tasteState(): TasteState | null {
  return state;
}

export function tasteSummary() {
  if (!state) return null;
  const sorted = [...VIBE_TAGS].sort((a, b) => state!.vector[b] - state!.vector[a]);
  const positive = VIBE_TAGS.reduce((s, t) => s + Math.max(0, state!.vector[t]), 0);
  return {
    vector: state.vector,
    topTags: sorted.slice(0, 3),
    mustGo: state.mustGo,
    swipeCount: state.swipeCount,
    deckSize: DECK_SIZE,
    strength: Math.min(1, positive / 6),
  };
}

/** Test/demo hook: reset the profile. */
export function resetTaste(): void {
  state = null;
}
