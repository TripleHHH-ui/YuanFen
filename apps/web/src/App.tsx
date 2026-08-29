import { useEffect, useState } from "react";
import { useStore } from "./store";
import { MapCanvas, type MapStop, type MapRec } from "./components/map/MapCanvas";
import { VibePicker } from "./components/onboarding/VibePicker";
import { TasteDeck } from "./components/onboarding/TasteDeck";
import { RoutePanel } from "./components/plan/RoutePanel";
import { NarrationStrip } from "./components/narration/NarrationStrip";
import { AlertBanner, DealHand } from "./components/deck/DealHand";
import { TripPanel } from "./components/trip/TripView";
import { BookingFlow } from "./components/booking/BookingFlow";
import { EvidencePanel } from "./components/evidence/EvidencePanel";

export default function App() {
  const s = useStore();
  const [recs, setRecs] = useState<MapRec[]>([]);

  useEffect(() => {
    void s.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (s.phase !== "home" || s.plan?.alternatives) { setRecs([]); return; }
    fetch(`/api/places/nearby/${s.currentCity.id}`)
      .then((r) => r.json() as Promise<{ places: Array<{ id: string; name: string; lat: number; lng: number; emoji: string }> }>)
      .then((data) => {
        setRecs(
          (data.places ?? []).map((p) => ({ lat: p.lat, lng: p.lng, label: p.name, emoji: p.emoji }))
        );
      })
      .catch(() => { /* silently skip */ });
  }, [s.phase, s.plan?.alternatives, s.currentCity.id]);

  if (s.phase === "vibes") {
    return (
      <div className="app-shell paper">
        <VibePicker />
        {s.error && <ErrorToast />}
      </div>
    );
  }
  if (s.phase === "deck") {
    return (
      <div className="app-shell paper">
        <TasteDeck />
        {s.error && <ErrorToast />}
      </div>
    );
  }

  const onTrip = s.phase === "trip" && s.trip;
  let stops: MapStop[] = [];
  let center = s.currentCity.center;
  if (onTrip && s.trip) {
    center = s.trip.center;
    const day = s.trip.graph.days[Math.min(s.tripDay, s.trip.graph.days.length - 1)];
    stops = (day?.stops ?? [])
      .filter((st) => st.place)
      .map((st) => ({
        lat: st.place!.lat,
        lng: st.place!.lng,
        label: st.sealed && !s.revealed[st.placeId] ? "Sealed wildcard" : (s.revealed[st.placeId]?.name ?? st.place!.name),
        sealed: st.sealed && !s.revealed[st.placeId],
      }));
  } else if (s.plan?.alternatives) {
    const alt = s.plan.alternatives[s.planAlt];
    center = s.plan.city?.center ?? s.currentCity.center;
    stops = (alt?.stops ?? [])
      .filter((st) => st.place)
      .map((st) => ({
        lat: st.place!.lat,
        lng: st.place!.lng,
        label: st.sealed && !s.revealed[st.placeId] ? "Sealed wildcard" : (s.revealed[st.placeId]?.name ?? st.place!.name),
        sealed: st.sealed && !s.revealed[st.placeId],
      }));
  }

  const narration = onTrip
    ? (s.swapNarration ?? s.trip?.graph.narration ?? null)
    : (s.plan?.narration ?? null);

  return (
    <div className="app-shell">
      <MapCanvas center={center} stops={stops} recommendations={recs} />
      <header className="topbar">
        <div className="wordmark small">
          <span className="hanzi">缘分</span> YuanFen
          <span className="tagline">the trip is one graph</span>
        </div>
        {s.mode === "fixture" && <span className="fixture-badge">FIXTURE FARES</span>}
      </header>

      {onTrip ? <TripPanel /> : <RoutePanel />}
      <AlertBanner />
      <DealHand />
      <NarrationStrip line={narration} tone={s.swapNarration && onTrip ? "swap" : "plan"} />
      <BookingFlow />
      <EvidencePanel />
      {s.error && <ErrorToast />}
    </div>
  );
}

function ErrorToast() {
  const { error, clearError } = useStore();
  return (
    <div className="toast" onClick={clearError}>
      {error} <span className="dim">· dismiss</span>
    </div>
  );
}
