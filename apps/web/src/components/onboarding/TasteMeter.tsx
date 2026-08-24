interface Props {
  strength: number;
  topTags: string[];
}

/** The taste thread: knots tie as the vector strengthens (FR-003). */
export function TasteMeter({ strength, topTags }: Props) {
  const knots = 7;
  const lit = Math.round(strength * knots);
  return (
    <div className="taste-meter">
      <div className="meter-thread">
        <div className="meter-fill" style={{ width: `${Math.max(4, strength * 100)}%` }} />
        {Array.from({ length: knots }, (_, i) => (
          <span key={i} className={`knot ${i < lit ? "tied" : ""}`} style={{ left: `${((i + 1) / (knots + 1)) * 100}%` }} />
        ))}
      </div>
      <div className="meter-tags">
        {topTags.length > 0 && strength > 0.05 ? (
          <>
            learning: {topTags.slice(0, 3).map((t) => (
              <b key={t}>{t}</b>
            ))}
          </>
        ) : (
          <span className="dim">your taste thread starts blank</span>
        )}
      </div>
    </div>
  );
}
