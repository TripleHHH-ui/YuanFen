interface Props {
  line: string | null;
  tone?: "plan" | "swap";
}

/** Option C: the single-line agent voice — one sentence, always (FR-014). */
export function NarrationStrip({ line, tone = "plan" }: Props) {
  if (!line) return null;
  return (
    <div className={`narration ${tone === "swap" ? "narration-swap" : ""}`} key={line}>
      <span className="narration-glyph">✦</span>
      <em>{line}</em>
    </div>
  );
}
