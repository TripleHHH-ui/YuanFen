import type { VibeTag } from "@yuanfen/shared";

/**
 * FR-004: deterministic S1 intent parser. No LLM in the request path — this
 * sits behind a stable shape so a Qwen/Claude parser can replace it later
 * without touching the planner. Same input, same route, every demo take.
 */
export interface ParsedIntent {
  city: string | null;
  cityName: string | null;
  area?: string;
  mustTags: string[];
  moodTags: VibeTag[];
  raw: string;
}

const CITIES: Array<{ id: string; name: string; aliases: string[] }> = [
  { id: "singapore", name: "Singapore", aliases: ["singapore", "sg"] },
  { id: "da-nang", name: "Da Nang", aliases: ["da nang", "danang"] },
  { id: "bali", name: "Bali", aliases: ["bali"] },
  { id: "chiang-mai", name: "Chiang Mai", aliases: ["chiang mai", "chiangmai"] },
  { id: "kuching", name: "Kuching", aliases: ["kuching"] },
];

const MOOD_MAP: Array<{ pattern: RegExp; tags: VibeTag[] }> = [
  { pattern: /\bquiet|peaceful|calm|slow|relax|unwind\b/i, tags: ["chill", "nature"] },
  { pattern: /\bnightlife|party|bar|drinks\b/i, tags: ["nightlife"] },
  { pattern: /\bart|museum|galler/i, tags: ["art", "culture"] },
  { pattern: /\bhistory|heritage|temple\b/i, tags: ["history", "culture"] },
  { pattern: /\bnature|park|garden|green\b/i, tags: ["nature"] },
  { pattern: /\bview|skyline|sunset\b/i, tags: ["views"] },
  { pattern: /\bshop|market\b/i, tags: ["shopping"] },
  { pattern: /\bfood|eat|hawker|makan\b/i, tags: ["food"] },
  { pattern: /\bcoffee|cafe|café\b/i, tags: ["coffee"] },
  { pattern: /\badventure|hike|trek\b/i, tags: ["adventure"] },
  { pattern: /\bbeach|sea|coast\b/i, tags: ["beach"] },
];

const MUST_PATTERN = /must\s+(?:eat|try|have|see|visit|do|go\s+to)\s+([a-z][a-z\s'-]*?)(?=\s*(?:,|\.|;|!|\?|$|\bthen\b|\band\b))/gi;

export function parseIntent(text: string): ParsedIntent {
  const lower = text.toLowerCase();
  const city = CITIES.find((c) => c.aliases.some((a) => lower.includes(a))) ?? null;

  const mustTags: string[] = [];
  for (const match of text.matchAll(MUST_PATTERN)) {
    const phrase = match[1]?.trim().toLowerCase();
    if (phrase) mustTags.push(phrase);
  }

  const moodTags: VibeTag[] = [];
  for (const { pattern, tags } of MOOD_MAP) {
    if (pattern.test(text)) for (const t of tags) if (!moodTags.includes(t)) moodTags.push(t);
  }

  return {
    city: city?.id ?? null,
    cityName: city?.name ?? null,
    ...(/\bcbd|downtown|city cent/i.test(text) ? { area: "CBD" } : {}),
    mustTags,
    moodTags,
    raw: text,
  };
}
