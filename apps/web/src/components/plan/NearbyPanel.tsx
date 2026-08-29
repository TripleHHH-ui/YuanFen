import { useEffect, useState } from "react";
import { useStore } from "../../store";

interface NearbyPlace {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  area: string;
  vibeTags: string[];
}

interface NearbyResponse {
  places: NearbyPlace[];
}

/** Taste-ranked nearby suggestions shown before the user has asked for a plan. */
export function NearbyPanel({ onSelect }: { onSelect: (text: string) => void }) {
  const { plan, planLoading, summary, currentCity } = useStore();
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(false);

  // Keep showing recommendations while there is no successful plan (including after a failed request).
  const visible = !plan?.alternatives && !planLoading;

  useEffect(() => {
    if (!visible) { setPlaces([]); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/places/nearby/${currentCity.id}`)
      .then((r) => r.json() as Promise<NearbyResponse>)
      .then((data) => {
        if (!cancelled) setPlaces(data.places ?? []);
      })
      .catch(() => { /* silently skip if API unavailable */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible, currentCity.id]);

  if (!visible || (places.length === 0 && !loading)) return null;

  return (
    <div className="nearby-panel" aria-label={`Suggested places near ${currentCity.name} CBD`}>
      <div className="nearby-header">
        <span className="nearby-kicker">near {currentCity.name} CBD</span>
        {summary && summary.topTags.length > 0 && (
          <span className="nearby-based">ranked for {summary.topTags.slice(0, 2).join(" · ")}</span>
        )}
      </div>
      {loading ? (
        <div className="nearby-loading">…</div>
      ) : (
        <ol className="nearby-list">
          {places.map((p) => (
            <li key={p.id} className="nearby-item">
              <button
                className="nearby-btn"
                onClick={() => onSelect(`Start at ${p.name}`)}
                title={p.blurb}
              >
                <span className="nearby-emoji">{p.emoji}</span>
                <span className="nearby-body">
                  <span className="nearby-name">{p.name}</span>
                  <span className="nearby-area">{p.area}</span>
                </span>
                <span className="nearby-use">use</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
