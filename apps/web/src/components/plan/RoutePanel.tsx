import { useState } from "react";
import { useStore } from "../../store";
import type { WireStop } from "../../api";
import { NearbyPanel } from "./NearbyPanel";

const EXAMPLE_PROMPTS = [
  "ArtScience Museum, must eat chicken rice, then somewhere quiet",
  "Quiet morning near Tiong Bahru, then somewhere with a view",
  "History and temples in Singapore CBD, must see the Esplanade",
];

/** S1 surface: chat bar + route card with swipeable alternatives (FR-004/005/006/007). */
export function RoutePanel() {
  const { plan, planAlt, setAlt, sendChat, planLoading, revealStop, revealed } = useStore();
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
