import {
  VIBE_TAGS,
  type DeckCard,
  type Place,
  type SwipeAction,
  type TasteState,
  type TasteVector,
  type VibeTag,
} from "./types.js";

const SEED_WEIGHT = 0.5;
const WEIGHTS: Record<SwipeAction, number> = { like: 0.3, pass: -0.15, mustgo: 0.6 };
const MIN_W = -1;
const MAX_W = 2;

export function emptyVector(): TasteVector {
  return Object.fromEntries(VIBE_TAGS.map((t) => [t, 0])) as TasteVector;
}

export function seedVector(picked: VibeTag[]): TasteVector {
  const v = emptyVector();
  for (const tag of picked) v[tag] = SEED_WEIGHT;
  return v;
}

export function initialTasteState(vector: TasteVector): TasteState {
  return { vector, mustGoByDestination: {}, swipeCount: 0, history: [] };
}

export function applySwipe(
  state: TasteState,
  card: DeckCard,
  action: SwipeAction,
  destination = "home",
): TasteState {
  const vector = { ...state.vector };
  for (const tag of card.vibeTags) {
    vector[tag] = Math.min(MAX_W, Math.max(MIN_W, vector[tag] + WEIGHTS[action]));
  }
  const mustGoByDestination = { ...state.mustGoByDestination };
  if (action === "mustgo" && card.placeId) {
    mustGoByDestination[destination] = [...(mustGoByDestination[destination] ?? []), card.placeId];
  }
  return {
    vector,
    mustGoByDestination,
    swipeCount: state.swipeCount + 1,
    history: [...state.history, { vector: state.vector, mustGoByDestination: state.mustGoByDestination }],
  };
}

export function undoSwipe(state: TasteState): TasteState {
  const prev = state.history[state.history.length - 1];
  if (!prev) return state;
  return {
    vector: prev.vector,
    mustGoByDestination: prev.mustGoByDestination,
    swipeCount: state.swipeCount - 1,
    history: state.history.slice(0, -1),
  };
}

export function scorePlace(vector: TasteVector, place: Place): number {
  let score = 0;
  for (const tag of place.vibeTags) score += vector[tag];
  return score / Math.sqrt(place.vibeTags.length || 1);
}
