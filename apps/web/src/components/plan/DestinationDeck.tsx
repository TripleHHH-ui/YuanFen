import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { SwipeDeck } from "../deck/SwipeDeck";

/**
 * Destination-scoped swipe deck — swipes post with the destination so
 * must-gos are honoured when a trip to that city is later built.
 */
export function DestinationDeck({
  destination,
  cityName,
  onClose,
}: {
  destination: string;
  cityName: string;
  onClose: () => void;
}) {
  const { destinationDecks, loadDestinationDeck, swipeDestination, undoDestination } = useStore();
  const entry = destinationDecks[destination];
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!entry && !loadError) {
      loadDestinationDeck(destination).catch((e) => {
        setLoadError(String(e instanceof Error ? e.message : e));
      });
    }
  }, [destination, entry, loadDestinationDeck, loadError]);

  if (loadError) {
    return (
      <div className="onboard deck-stage">
        <header className="deck-head">
          <button className="back" onClick={onClose}>‹ back</button>
        </header>
        <div className="deck-area">
          <div className="swipe-card live done-card">{loadError}</div>
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="onboard deck-stage">
        <header className="deck-head">
          <button className="back" onClick={onClose}>‹ back</button>
          <div className="deck-progress">loading…</div>
        </header>
      </div>
    );
  }

  const mustGoCount = entry.summary?.mustGo.length ?? 0;

  return (
    <SwipeDeck
      cards={entry.deck}
      index={entry.index}
      onSwipe={(action) => void swipeDestination(destination, action)}
      onUndo={() => void undoDestination(destination)}
      headContent={
        <div className="dest-head">
          <button className="back" onClick={onClose}>‹ back</button>
          <div className="dest-title">Swipe {cityName} favourites for next time</div>
        </div>
      }
      meterContent={
        <div className="dest-meter">
          <span>{mustGoCount} must-go{mustGoCount !== 1 ? "s" : ""} marked for {cityName}</span>
        </div>
      }
      emptyMessage={`Done swiping ${cityName} — your must-gos are saved.`}
    />
  );
}
