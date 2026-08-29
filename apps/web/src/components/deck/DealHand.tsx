import { useStore } from "../../store";
import type { Deal } from "../../api";
import { DestinationDeck } from "../plan/DestinationDeck";
import { useState } from "react";

/**
 * S3: the unprompted long-weekend hand — 3 open cards + one sealed wildcard
 * (FR-008/009/010). Fare surfaces carry the FIXTURE badge when applicable and
 * zero prediction language.
 */
export function AlertBanner() {
  const { alert, alertOpen, openAlert, phase } = useStore();
  if (!alert?.hand || alertOpen || phase !== "home") return null;
  const w = alert.weekend!;
  return (
    <button className="alert-slip" onClick={() => openAlert(true)}>
      <span className="alert-dot" />
      <div>
        <b>Nobody searched.</b> {w.holiday} makes {w.start.slice(5)}–{w.end.slice(5)} a {w.nights}-night
        weekend — I built you {alert.hand.top.length} trips and sealed one wildcard.
      </div>
      <span className="alert-open">open ›</span>
    </button>
  );
}

export function DealHand() {
  const { alert, alertOpen, openAlert, expandDeal, wildcardDealRevealed, revealWildcardDeal, mode } = useStore();
  const [destDeckTarget, setDestDeckTarget] = useState<{ destination: string; cityName: string } | null>(null);
  if (!alertOpen || !alert?.hand) return null;
  if (destDeckTarget) {
    return (
      <DestinationDeck
        destination={destDeckTarget.destination}
        cityName={destDeckTarget.cityName}
        onClose={() => setDestDeckTarget(null)}
      />
    );
  }
  const { top, wildcard } = alert.hand;
  const w = alert.weekend!;
  return (
    <div className="overlay" onClick={() => openAlert(false)}>
      <div className="hand-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="hand-head">
          <div>
            <div className="hand-kicker">the board moved first</div>
            <h2>
              {w.holiday} long weekend <span className="dim">· {w.start} → {w.end}</span>
            </h2>
          </div>
          <button className="close" onClick={() => openAlert(false)}>✕</button>
        </header>
        <div className="hand-cards">
          {top.map((d, i) => (
            <DealCard
              key={d.destination}
              deal={d}
              rank={i + 1}
              mode={mode}
              onExpand={() => void expandDeal(d.destination)}
              onTaste={() => setDestDeckTarget({ destination: d.city, cityName: d.cityName })}
            />
          ))}
          <WildcardCard
            deal={wildcard}
            revealed={wildcardDealRevealed}
            mode={mode}
            onReveal={revealWildcardDeal}
            onExpand={() => void expandDeal(wildcard.destination)}
            onTaste={() => setDestDeckTarget({ destination: wildcard.city, cityName: wildcard.cityName })}
          />
        </div>
        <footer className="hand-foot">
          ranked by your taste thread over last night's fare board — headline prices include a checked bag
        </footer>
      </div>
    </div>
  );
}

function DealCard({ deal, rank, mode, onExpand, onTaste }: { deal: Deal; rank: number; mode: string; onExpand: () => void; onTaste: () => void }) {
  return (
    <button className="deal-card" onClick={onExpand} style={{ transitionDelay: `${rank * 60}ms` }}>
      {mode === "fixture" && <span className="fixture-badge">FIXTURE</span>}
      <div className="deal-rank">{rank}</div>
      <div className="deal-city">{deal.cityName}</div>
      <div className="deal-route">
        {deal.offer.origin} → {deal.destination} · {deal.offer.flight_no}
      </div>
      <div className="deal-price">
        S${Math.round(deal.totalWithBag)}
        <span className="deal-price-note">with 20kg bag</span>
      </div>
      <div className="deal-tags">
        {deal.novelTags.length > 0 && <span className="tag">new: {deal.novelTags[0]}</span>}
        {deal.hasCityFile && (
          <span
            className="deal-taste"
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onTaste(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onTaste(); } }}
            title={`Swipe ${deal.cityName} favourites`}
          >✦ taste</span>
        )}
        <span className="deal-expand">tap → full plan</span>
      </div>
    </button>
  );
}

function WildcardCard({
  deal,
  revealed,
  mode,
  onReveal,
  onExpand,
  onTaste,
}: {
  deal: Deal;
  revealed: boolean;
  mode: string;
  onReveal: () => void;
  onExpand: () => void;
  onTaste: () => void;
}) {
  if (!revealed) {
    return (
      <button className="deal-card wildcard-sealed" onClick={onReveal}>
        <div className="wax-seal">缘</div>
        <div className="deal-city">Wildcard</div>
        <div className="deal-route">sealed by the board</div>
        <div className="deal-expand">break the seal</div>
      </button>
    );
  }
  return (
    <button className="deal-card wildcard-open" onClick={onExpand}>
      {mode === "fixture" && <span className="fixture-badge">FIXTURE</span>}
      <div className="deal-rank">✦</div>
      <div className="deal-city">{deal.cityName}</div>
      <div className="deal-route">
        {deal.offer.origin} → {deal.destination} · {deal.offer.flight_no}
      </div>
      <div className="deal-price">
        S${Math.round(deal.totalWithBag)}
        <span className="deal-price-note">with 20kg bag</span>
      </div>
      <div className="deal-tags">
        {deal.novelTags.map((t) => (
          <span key={t} className="tag">new: {t}</span>
        ))}
        {deal.hasCityFile && (
          <span
            className="deal-taste"
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onTaste(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onTaste(); } }}
            title={`Swipe ${deal.cityName} favourites`}
          >✦ taste</span>
        )}
        <span className="deal-expand">tap → full plan</span>
      </div>
    </button>
  );
}
