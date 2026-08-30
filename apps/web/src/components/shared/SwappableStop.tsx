import type { StopAlternative, WireStop } from "../../api";

interface SwappableStopProps {
  stop: WireStop;
  index: number;
  cityId: string;
  revealed: Record<string, { name: string; emoji: string; blurb: string; photoUrl?: string }>;
  onReveal: (city: string, placeId: string) => Promise<void>;
  isChanged?: boolean;
  isSwapping?: boolean;
  alternatives?: StopAlternative[] | null;
  onOpenSwap?: () => void;
  onCloseSwap?: () => void;
  onSwapStop?: (placeId: string) => void;
  showCost?: boolean;
  showMustBadge?: boolean;
}

/** Shared stop row: sealed wildcard reveal, swap affordance, and ranked alternatives. */
export function SwappableStop({
  stop,
  index,
  cityId,
  revealed,
  onReveal,
  isChanged,
  isSwapping,
  alternatives,
  onOpenSwap,
  onCloseSwap,
  onSwapStop,
  showCost,
  showMustBadge,
}: SwappableStopProps) {
  const open = revealed[stop.placeId];
  const swappable = !!onOpenSwap && !!onSwapStop;

  if (stop.sealed && !open) {
    return (
      <li className="stop sealed" style={{ animationDelay: `${index * 70}ms` }} onClick={() => void onReveal(cityId, stop.placeId)}>
        <span className="stop-n wax">?</span>
        <div className="stop-body">
          <div className="stop-name">Sealed wildcard</div>
          <div className="stop-meta">{stop.arrive} · tap to break the seal</div>
        </div>
        <span className="seal-glyph">缘</span>
      </li>
    );
  }

  const name = open?.name ?? stop.place?.name ?? stop.placeId;
  const emoji = open?.emoji ?? stop.place?.emoji ?? "📍";
  const photo = open?.photoUrl ?? stop.place?.photoUrl;

  return (
    <li
      className={`stop ${isChanged ? "stop-swapped" : ""} ${stop.role === "wildcard" ? "revealed-wild" : ""} ${isSwapping ? "stop-swapping" : ""}`}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <span className="stop-n">{index + 1}</span>
      {photo ? (
        <img className="stop-thumb" src={photo} alt="" loading="lazy" />
      ) : (
        <span className="stop-thumb is-emoji">{emoji}</span>
      )}
      <div className="stop-body">
        <div className="stop-name">
          {name}
          {showMustBadge && stop.role === "must" && <span className="must-mark">must-go</span>}
          {stop.role === "wildcard" && <span className="wild-mark">wildcard</span>}
          {isChanged && <span className="swapped-mark">swapped</span>}
        </div>
        <div className="stop-meta">
          {stop.arrive}–{stop.depart}
          {stop.travelMinFromPrev > 0 && index > 0 && <> · {stop.travelMinFromPrev} min hop</>}
          {showCost && stop.place && stop.place.estCostSGD > 0 && <> · ~S${stop.place.estCostSGD}</>}
        </div>
        {swappable && (
          <button
            className="swap-stop-btn"
            onClick={(e) => { e.stopPropagation(); isSwapping ? onCloseSwap!() : onOpenSwap!(); }}
            title={isSwapping ? "Close" : "Swap this stop"}
          >
            ⇄
          </button>
        )}
        {isSwapping && alternatives && (
          <div className="alt-list">
            <div className="alt-head">swap this stop</div>
            {alternatives.length === 0 ? (
              <div className="alt-empty">No alternatives fit this slot.</div>
            ) : (
              <div className="alt-scroll">
                {alternatives.map((a) => (
                  <button key={a.id} className="alt-row" onClick={() => onSwapStop!(a.id)}>
                    {a.photoUrl ? (
                      <img className="alt-thumb" src={a.photoUrl} alt="" loading="lazy" />
                    ) : (
                      <span className="alt-emoji">{a.emoji}</span>
                    )}
                    <span className="alt-name">{a.name}</span>
                    <span className="alt-tags">{a.vibeTags.slice(0, 2).join(" · ")}</span>
                    <span className="alt-cost">{a.estCostSGD > 0 ? `~S$${a.estCostSGD}` : "free"}</span>
                    <span className="alt-travel">{a.travelMinFromPrev} min</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
