import { useStore } from "../../store";
import type { Offer } from "../../api";
import { DestinationDeck } from "../plan/DestinationDeck";
import { SwappableStop } from "../shared/SwappableStop";
import { useState } from "react";

/** S4 surface: flight strip (node zero), day timeline, budget bar (FR-013/014). */
export function TripPanel() {
  const {
    trip, tripDay, setTripDay, swapFlight, reflowing, swapDelta,
    swappingStop, stopSwapDelta, changedStopId,
    openStopSwap, closeStopSwap, swapStop,
    revealStop, revealed, openBooking, backHome, mode,
  } = useStore();
  const [showDestDeck, setShowDestDeck] = useState(false);
  if (!trip) return null;
  if (showDestDeck) {
    return (
      <DestinationDeck
        destination={trip.graph.city}
        cityName={trip.cityName}
        onClose={() => setShowDestDeck(false)}
      />
    );
  }
  const g = trip.graph;
  const day = g.days[Math.min(tripDay, g.days.length - 1)]!;
  const current = g.flight.out;

  return (
    <aside className="route-panel trip-panel">
      <div className="trip-head">
        <button className="back" onClick={backHome}>‹ board</button>
        <div>
          <div className="route-city">{trip.cityName}</div>
          <div className="route-take">
            {g.window.holiday} · {g.window.start.slice(5)} → {g.window.end.slice(5)}
          </div>
        </div>
        <button className="dest-deck-btn" onClick={() => setShowDestDeck(true)} title={`Swipe ${trip.cityName} favourites`}>
          ✦ taste
        </button>
      </div>

      <div className="flight-strip-block">
        <div className="block-label">flight — node zero</div>
        {trip.flightOptions.map((o) => (
          <FlightRow
            key={o.offer_id}
            offer={o}
            active={o.offer_id === current.offer_id}
            mode={mode}
            onSwap={() => void swapFlight(o.offer_id)}
            onBook={() => openBooking(o.offer_id)}
          />
        ))}
        <div className="ret-line">
          ⤶ return {g.flight.ret.flight_no} · {g.flight.ret.departDate} {g.flight.ret.departLocal}
        </div>
      </div>

      <BudgetBar flight={g.budget.flightTotal} ground={g.budget.ground} total={g.budget.total} delta={swapDelta} />

      <div className="day-tabs">
        {g.days.map((d, i) => (
          <button key={d.date} className={i === tripDay ? "on" : ""} onClick={() => setTripDay(i)}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${d.date}T00:00:00Z`).getUTCDay()]}
            <span className="tab-date">{d.date.slice(8)}</span>
          </button>
        ))}
      </div>

      <ol className={`stop-list day-stops ${reflowing ? "reflowing" : ""}`} key={`${day.date}-${current.offer_id}`}>
        {day.stops.length === 0 && <li className="stop empty">a travel day — wheels up</li>}
        {day.stops.map((s, i) => (
          <SwappableStop
            key={s.placeId}
            stop={s}
            index={i}
            cityId={g.city}
            revealed={revealed}
            onReveal={revealStop}
            isChanged={changedStopId === s.placeId}
            isSwapping={swappingStop?.dayIndex === tripDay && swappingStop?.stopIndex === i}
            alternatives={swappingStop?.dayIndex === tripDay && swappingStop?.stopIndex === i ? swappingStop.alternatives : null}
            onOpenSwap={() => void openStopSwap(tripDay, i)}
            onCloseSwap={closeStopSwap}
            onSwapStop={(placeId) => void swapStop(tripDay, i, placeId)}
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

      {g.explanations.map((e) => (
        <div key={e} className="explain-line">⚑ {e}</div>
      ))}
    </aside>
  );
}

function FlightRow({
  offer,
  active,
  mode,
  onSwap,
  onBook,
}: {
  offer: Offer;
  active: boolean;
  mode: string;
  onSwap: () => void;
  onBook: () => void;
}) {
  return (
    <div className={`flight-row ${active ? "active" : ""}`}>
      <button className="flight-main" onClick={active ? undefined : onSwap} title={active ? "Current flight" : "Swap to this flight — day one will re-plan"}>
        <span className="fl-no">{offer.flight_no}</span>
        <span className="fl-time">
          {offer.departDate.slice(5)} {offer.departLocal} → {offer.arriveLocal}
        </span>
        <span className="fl-price">
          S${Math.round((offer.totalWithBag ?? offer.price.base + offer.bags.checked_fee))}
          <span className="fl-bag">w/ bag</span>
        </span>
        {mode === "fixture" && <span className="fixture-badge tiny">FIXTURE</span>}
      </button>
      {active ? <button className="book-btn" onClick={onBook}>book</button> : <span className="swap-hint">swap ⇄</span>}
    </div>
  );
}

function BudgetBar({ flight, ground, total, delta }: { flight: number; ground: number; total: number; delta: number | null }) {
  const flightPct = total > 0 ? (flight / total) * 100 : 0;
  return (
    <div className="budget-block">
      <div className="block-label">
        one budget
        {delta !== null && delta !== 0 && (
          <span className={`delta-chip ${delta > 0 ? "up" : "down"}`}>
            {delta > 0 ? "+" : "−"}S${Math.abs(Math.round(delta))}
          </span>
        )}
      </div>
      <div className="budget-bar">
        <div className="budget-flight" style={{ width: `${flightPct}%` }} />
        <div className="budget-ground" style={{ width: `${100 - flightPct}%` }} />
      </div>
      <div className="budget-legend">
        <span><i className="sw sw-flight" /> air S${Math.round(flight)}</span>
        <span><i className="sw sw-ground" /> ground S${Math.round(ground)}</span>
        <b>S${Math.round(total)} all-in</b>
      </div>
    </div>
  );
}

