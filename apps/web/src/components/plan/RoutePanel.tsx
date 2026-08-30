import { useState } from "react";
import { useStore } from "../../store";
import { NearbyPanel } from "./NearbyPanel";
import { SwappableStop } from "../shared/SwappableStop";

const EXAMPLE_PROMPTS = [
  "ArtScience Museum, must eat chicken rice, then somewhere quiet",
  "Quiet morning near Tiong Bahru, then somewhere with a view",
  "History and temples in Singapore CBD, must see the Esplanade",
];

/** S1 surface: chat bar + route card with swipeable alternatives (FR-004/005/006/007). */
export function RoutePanel() {
  const {
    plan, planAlt, setAlt, sendChat, planLoading,
    revealStop, revealed,
    swappingStop, stopSwapDelta, changedStopId,
    openStopSwap, closeStopSwap, swapStop,
  } = useStore();
  const [text, setText] = useState("");

  const alt = plan?.alternatives?.[planAlt];
  const showLanding = !plan?.alternatives && !planLoading;

  function submit(value: string) {
    const trimmed = value.trim();
    if (trimmed) void sendChat(trimmed);
  }

  return (
    <aside className="route-panel">
      <div className="composer-wrap">
        <form
          className="composer-bar"
          onSubmit={(e) => {
            e.preventDefault();
            submit(text);
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tell me the day you want — places, cravings, mood…"
            aria-label="Trip request"
            autoComplete="off"
          />
          <button type="submit" disabled={planLoading} aria-label="Plan">
            {planLoading ? "…" : "→"}
          </button>
        </form>

        {showLanding && (
          <div className="example-prompts">
            <span className="example-label">Try</span>
            {EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                className="example-chip"
                onClick={() => {
                  setText(p);
                  submit(p);
                }}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <NearbyPanel onSelect={(value) => { setText(value); submit(value); }} />

      {plan?.error && <div className="plan-error">{plan.error}</div>}

      {alt && plan && (
        <div className="route-card" key={planAlt}>
          <div className="route-card-head">
            <div>
              <div className="route-city">{plan.city?.name} · {plan.date}</div>
              <div className="route-take">
                take {planAlt + 1} · keep going for another
              </div>
            </div>
            <div className="alt-nav">
              <button onClick={() => setAlt(planAlt - 1)} aria-label="Previous take">‹</button>
              <button onClick={() => setAlt(planAlt + 1)} aria-label="Next take">›</button>
            </div>
          </div>
          <ol className="stop-list">
            {alt.stops.map((s, i) => (
              <SwappableStop
                key={s.placeId}
                stop={s}
                index={i}
                cityId={plan.city!.id}
                revealed={revealed}
                onReveal={revealStop}
                isChanged={changedStopId === s.placeId}
                isSwapping={swappingStop?.dayIndex === 0 && swappingStop?.stopIndex === i}
                alternatives={swappingStop?.dayIndex === 0 && swappingStop?.stopIndex === i ? swappingStop.alternatives : null}
                onOpenSwap={() => void openStopSwap(0, i)}
                onCloseSwap={closeStopSwap}
                onSwapStop={(placeId) => void swapStop(0, i, placeId)}
                showCost
                showMustBadge
              />
            ))}
          </ol>

          {stopSwapDelta && (
            <div className="stop-swap-deltas">
              {stopSwapDelta.costDeltaSGD !== 0 && (
                <span className={`delta-chip ${stopSwapDelta.costDeltaSGD > 0 ? "up" : "down"}`}>
                  {stopSwapDelta.costDeltaSGD > 0 ? "+" : "−"}S${Math.abs(Math.round(stopSwapDelta.costDeltaSGD))} ground
                </span>
              )}
              {stopSwapDelta.travelDeltaMin !== 0 && (
                <span className="delta-chip travel">
                  {stopSwapDelta.travelDeltaMin > 0 ? "+" : "−"}{Math.abs(stopSwapDelta.travelDeltaMin)} min travel
                </span>
              )}
            </div>
          )}

          {alt.explanations.map((e) => (
            <div key={e} className="explain-line">⚑ {e}</div>
          ))}
        </div>
      )}
    </aside>
  );
}

