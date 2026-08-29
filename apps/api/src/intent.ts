import type { Place, VibeTag } from "@yuanfen/shared";
import { loadCity } from "./data.js";

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

export interface ParseOptions {
  /** City currently in view; used when the user does not name one explicitly. */
  contextCity?: string;
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

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function cleanMustTag(tag: string): string {
  return tag.replace(/^(?:the|a|an)\s+/i, "").trim();
}

function findPlaceMatches(text: string, places: Place[]): string[] {
  const normalizedText = normaliseName(text);
  const segments = normalizedText
    .split(/[,;.!?]|\bthen\b|\band\b|\bnear\b|\bat\b|\bin\b|\bvisit\b|\bsee\b/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);

  const matches = new Set<string>();

  for (const place of places) {
    const placeNorm = normaliseName(place.name);
    if (placeNorm.length < 3) continue;

    if (normalizedText.includes(placeNorm)) {
      matches.add(placeNorm);
      continue;
    }

    for (const segment of segments) {
      if (placeNorm.includes(segment) || segment.includes(placeNorm)) {
        matches.add(segment);
      }
    }
  }

  return Array.from(matches);
}

export function parseIntent(text: string, options: ParseOptions = {}): ParsedIntent {
  const lower = text.toLowerCase();
  const explicitCity = CITIES.find((c) => c.aliases.some((a) => lower.includes(a))) ?? null;
  const contextCity = options.contextCity ? CITIES.find((c) => c.id === options.contextCity) ?? null : null;
  const city = explicitCity ?? contextCity;

  const mustTags: string[] = [];
  for (const match of text.matchAll(MUST_PATTERN)) {
    const phrase = cleanMustTag(match[1]?.trim().toLowerCase() ?? "");
    if (phrase) mustTags.push(phrase);
  }

  let places: Place[] = [];
  if (city) {
    try {
      places = loadCity(city.id).places;
    } catch {
      places = [];
    }
  }

  const barePlaces = city ? findPlaceMatches(text, places) : [];
  for (const p of barePlaces) {
    const cleaned = cleanMustTag(p);
    if (cleaned && !mustTags.includes(cleaned)) mustTags.push(cleaned);
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
