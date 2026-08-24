import { useRef, useState } from "react";
import { useStore } from "../../store";
import { TasteMeter } from "./TasteMeter";

/**
 * FR-003: 15-card swipe session — like / pass / must-go, undo, visible
 * progress. Drag with pointer events; buttons mirror the gestures.
 */
export function TasteDeck() {
  const { deck, deckIndex, summary, swipe, undo } = useStore();
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [leaving, setLeaving] = useState<"like" | "pass" | "mustgo" | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const card = deck[deckIndex];
  const upcoming = deck.slice(deckIndex + 1, deckIndex + 3);

  function fire(action: "like" | "pass" | "mustgo") {
    if (leaving || !card) return;
    setLeaving(action);
    setTimeout(() => {
      setLeaving(null);
      setDrag(null);
      void swipe(action);
    }, 320);
  }

  function onPointerDown(e: React.PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    setDrag({ dx: e.clientX - start.current.x, dy: e.clientY - start.current.y });
  }
  function onPointerUp() {
    if (!start.current) return;
    const dx = drag?.dx ?? 0;
    const dy = drag?.dy ?? 0;
    start.current = null;
    if (dy < -110) fire("mustgo");
    else if (dx > 110) fire("like");
    else if (dx < -110) fire("pass");
    else setDrag(null);
  }

  const tilt = drag ? drag.dx / 18 : 0;
  const leaveTransform =
    leaving === "like"
      ? "translate(120vw, -8vh) rotate(24deg)"
      : leaving === "pass"
        ? "translate(-120vw, -8vh) rotate(-24deg)"
        : leaving === "mustgo"
          ? "translate(0, -120vh) rotate(-4deg) scale(1.05)"
          : undefined;

  return (
    <div className="onboard deck-stage">
      <header className="deck-head">
        <div className="wordmark small">
          <span className="hanzi">缘分</span> YuanFen
        </div>
        <div className="deck-progress">
          {deckIndex}/{deck.length} <span className="dim">swiped</span>
        </div>
      </header>

      <TasteMeter strength={summary?.strength ?? 0} topTags={summary?.topTags ?? []} />

      <div className="deck-area">
        {upcoming.reverse().map((c, i) => (
          <div key={c.id} className="swipe-card ghost" style={{ transform: `translateY(${(2 - i) * 10}px) scale(${1 - (2 - i) * 0.035}) rotate(${(2 - i) % 2 ? -1.5 : 1.5}deg)` }}>
            <div className="card-emoji">{c.emoji}</div>
          </div>
        ))}
        {card ? (
          <div
            className={`swipe-card live ${drag ? "dragging" : ""}`}
            style={{
              transform:
                leaveTransform ??
                (drag ? `translate(${drag.dx}px, ${drag.dy}px) rotate(${tilt}deg)` : undefined),
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {drag && drag.dx > 50 && <div className="stamp stamp-like">KEEP</div>}
            {drag && drag.dx < -50 && <div className="stamp stamp-pass">PASS</div>}
            {drag && drag.dy < -50 && <div className="stamp stamp-must">MUST-GO</div>}
            <div className="card-emoji">{card.emoji}</div>
            <div className="card-title">{card.title}</div>
            <div className="card-sub">{card.subtitle}</div>
            <div className="card-tags">
              {card.vibeTags.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="swipe-card live done-card">Reading your thread…</div>
        )}
      </div>

      <div className="deck-actions">
        <button className="act act-pass" onClick={() => fire("pass")} title="Pass">
          ✕
        </button>
        <button className="act act-undo" onClick={() => void undo()} title="Undo last swipe">
          ↺
        </button>
        <button className="act act-must" onClick={() => fire("mustgo")} title="Must-go">
          ✦
        </button>
        <button className="act act-like" onClick={() => fire("like")} title="Keep">
          ♥
        </button>
      </div>
      <p className="deck-hint">drag right to keep · left to pass · up for must-go</p>
    </div>
  );
}
