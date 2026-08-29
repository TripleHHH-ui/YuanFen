import { useStore } from "../../store";

const VIBE_META: Record<string, { emoji: string; label: string }> = {
  food: { emoji: "🍜", label: "Food-led" },
  coffee: { emoji: "☕", label: "Café slow" },
  nature: { emoji: "🌿", label: "Green & wild" },
  culture: { emoji: "🏮", label: "Culture" },
  nightlife: { emoji: "🌙", label: "After dark" },
  shopping: { emoji: "🛍️", label: "Markets" },
  adventure: { emoji: "🥾", label: "Adventure" },
  chill: { emoji: "🍃", label: "Unhurried" },
  art: { emoji: "🎨", label: "Art" },
  history: { emoji: "🏛️", label: "History" },
  beach: { emoji: "🌊", label: "Salt air" },
  views: { emoji: "🌅", label: "Big views" },
  sports: { emoji: "🏟️", label: "Full roar" },
  wellness: { emoji: "🧘", label: "Slow breath" },
};

export function VibePicker() {
  const { allVibes, vibes, toggleVibe, confirmVibes } = useStore();
  const ready = vibes.length >= 5;
  return (
    <div className="onboard">
      <header className="onboard-head reveal-1">
        <div className="wordmark">
          <span className="hanzi">缘分</span> YuanFen
        </div>
        <h1>
          Some trips are <em>meant</em> to find you.
        </h1>
        <p className="sub">
          Pick at least five vibes — this seeds your taste thread. {/* FR-002 */}
          <span className="count-chip">{vibes.length}/5</span>
        </p>
      </header>
      <div className="vibe-grid reveal-2">
        {allVibes.map((tag) => (
          <button
            key={tag}
            className={`vibe-chip ${vibes.includes(tag) ? "sealed" : ""}`}
            onClick={() => toggleVibe(tag)}
          >
            <span className="vibe-emoji">{VIBE_META[tag]?.emoji ?? "✳️"}</span>
            {VIBE_META[tag]?.label ?? tag}
          </button>
        ))}
      </div>
      <button className="cta reveal-3" disabled={!ready} onClick={() => void confirmVibes()}>
        {ready ? "Tie the thread →" : "Pick 5 vibes to continue"}
      </button>
    </div>
  );
}
