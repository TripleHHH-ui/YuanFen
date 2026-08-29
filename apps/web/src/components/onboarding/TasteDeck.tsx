import { useStore } from "../../store";
import { TasteMeter } from "./TasteMeter";
import { SwipeDeck } from "../deck/SwipeDeck";

/**
 * FR-003: 15-card swipe session — like / pass / must-go, undo, visible
 * progress. Drag with pointer events; buttons mirror the gestures.
 */
export function TasteDeck() {
  const { deck, deckIndex, summary, swipe, undo } = useStore();

  return (
    <SwipeDeck
      cards={deck}
      index={deckIndex}
      onSwipe={(action) => void swipe(action)}
      onUndo={() => void undo()}
      meterContent={<TasteMeter strength={summary?.strength ?? 0} topTags={summary?.topTags ?? []} />}
    />
  );
}
