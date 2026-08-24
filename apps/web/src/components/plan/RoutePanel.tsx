import { useState } from "react";
import { useStore } from "../../store";
import type { WireStop } from "../../api";

/** S1 surface: chat bar + route card with swipeable alternatives (FR-004/005/006/007). */
export function RoutePanel() {
  const { plan, planAlt, setAlt, sendChat, planLoading, revealStop, revealed } = useStore();
  const [text, setText] = useState("Day trip in Singapore CBD, must eat chicken rice, then somewhere quiet");

  const alt = plan?.alternatives?.[planAlt];

  return (
    <aside className="route-panel">
      <form
        className="chat-bar"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void sendChat(text.trim());
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tell me the day you want…"
          aria-label="Trip request"
        />
        <button type="submit" disabled={planLoading}>
          {planLoading ? "…" : "→"}
        </button>
      </form>

      {plan?.error && <div className="plan-error">{plan.error}</div>}

      {alt && plan && (
        <div className="route-card" key={planAlt}>
          <div className="route-card-head">
            <div>
              <div className="route-city">{plan.city?.name} · {plan.date}</div>
              <div className="route-take">
                take {planAlt + 1}/{plan.alternatives!.length}
              </div>
            </div>
            <div className="alt-nav">
              <button onClick={() => setAlt(planAlt - 1)} aria-label="Previous take">‹</button>
              <button onClick={() => setAlt(planAlt + 1)} aria-label="Next take">›</button>
            </div>
          </div>
          <ol className="stop-list">
            {alt.stops.map((s, i) => (
              <StopRow key={s.placeId} stop={s} index={i} cityId={plan.city!.id} revealed={revealed} onReveal={revealStop} />
            ))}
          </ol>
          {alt.explanations.map((e) => (
            <div key={e} className="explain-line">⚑ {e}</div>
          ))}
        </div>
      )}
    </aside>
  );
}

function StopRow({
  stop,
  index,
  cityId,
  revealed,
  onReveal,
}: {
  stop: WireStop;
  index: number;
  cityId: string;
  revealed: Record<string, { name: string; emoji: string; blurb: string }>;
  onReveal: (city: string, placeId: string) => Promise<void>;
}) {
  const open = revealed[stop.placeId];
  if (stop.sealed && !open) {
    return (
      <li className="stop sealed" onClick={() => void onReveal(cityId, stop.placeId)}>
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
  return (
    <li className={`stop ${stop.role === "wildcard" ? "revealed-wild" : ""}`}>
      <span className="stop-n">{index + 1}</span>
      <div className="stop-body">
        <div className="stop-name">
          {emoji} {name}
          {stop.role === "must" && <span className="must-mark">must-go</span>}
          {stop.role === "wildcard" && <span className="wild-mark">wildcard</span>}
        </div>
        <div className="stop-meta">
          {stop.arrive}–{stop.depart}
          {stop.travelMinFromPrev > 0 && index > 0 && <> · {stop.travelMinFromPrev} min hop</>}
          {stop.place && stop.place.estCostSGD > 0 && <> · ~S${stop.place.estCostSGD}</>}
        </div>
      </div>
    </li>
  );
}
