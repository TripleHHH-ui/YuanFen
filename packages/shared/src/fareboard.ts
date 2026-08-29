import type { FareSnapshotEntry, FlightOption, TasteVector, VibeTag } from "./types.js";

// Taste leads the ranking, but a scarce or restrictive fare moment can promote
// a destination a rank or two. The weights are applied to two 0..1 components,
// so the effective split is the agreed 65 % taste affinity / 35 % fare moment.
export const W_TASTE = 0.65;
export const W_FARE_MOMENT = 0.35;

const STRONG_TAG_THRESHOLD = 0.6;
const MAX_AFFINITY = 1.0;
const SEAT_SCARCITY_WINDOW = 8;
const SPREAD_REFERENCE = 0.4;

export interface DestinationProfile {
  iata: string;
  cityName: string;
  city: string;
  tags: VibeTag[];
  hasCityFile: boolean;
}

export interface RankedDeal {
  destination: string;
  cityName: string;
  city: string;
  hasCityFile: boolean;
  offer: FlightOption;
  totalWithBag: number;
  score: number;
  novelTags: VibeTag[];
  sealed: boolean;
}

export interface HandResult {
  top: RankedDeal[];
  wildcard: RankedDeal;
}

export interface DistressSignal {
  seatCount?: number | null; // lower = scarcer
  familySpreadPct?: number | null; // (next-tier price - this price) / this price
  refundable: boolean | null;
  changeable: boolean | null;
}

export function totalWithBag(offer: FlightOption): number {
  return offer.price.base + (offer.bags.included ? 0 : offer.bags.checked_fee);
}

function tagScore(taste: TasteVector, tags: VibeTag[]): number {
  let s = 0;
  for (const t of tags) s += taste[t];
  return s / (tags.length || 1);
}

export function fareMoment(signal: DistressSignal): number {
  const scores: number[] = [];

  if (signal.seatCount != null) {
    const n = signal.seatCount;
    scores.push(n <= 1 ? 1 : Math.max(0, 1 - (n - 1) / SEAT_SCARCITY_WINDOW));
  }

  if (signal.familySpreadPct != null) {
    scores.push(Math.min(1, Math.max(0, signal.familySpreadPct / SPREAD_REFERENCE)));
  }

  if (typeof signal.refundable === "boolean") {
    scores.push(signal.refundable ? 0 : 1);
  }

  if (typeof signal.changeable === "boolean") {
    scores.push(signal.changeable ? 0 : 1);
  }

  if (scores.length === 0) return 0.5;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function unexpectedness(taste: TasteVector, destinationTags: VibeTag[]): number {
  if (destinationTags.length === 0) return 1;

  let overlap = 0;
  for (const tag of destinationTags) {
    const v = taste[tag];
    if (v > STRONG_TAG_THRESHOLD) {
      overlap += Math.min(1, (v - STRONG_TAG_THRESHOLD) / (MAX_AFFINITY - STRONG_TAG_THRESHOLD));
    }
  }
  return 1 - overlap / destinationTags.length;
}

function buildSignal(offer: FlightOption): DistressSignal {
  return {
    seatCount: offer.seatCount,
    familySpreadPct: offer.familySpreadPct,
    refundable: offer.refundable ?? null,
    changeable: offer.changeable ?? null,
  };
}

/**
 * FR-009/FR-021/FR-022: rank stored snapshots against the taste vector using a
 * taste-led blend of tag affinity, fare-moment distress, and unexpectedness.
 * FR-010: headline number is always total with checked bag.
 *
 * Hand = top 3 by blend score (ties -> cheaper total first, then IATA).
 * Wildcard = the remaining destination with full trip data that introduces the
 * most novelty relative to what the user has already strongly expressed.
 */
export function rankHand(
  snapshots: FareSnapshotEntry[],
  taste: TasteVector,
  profiles: Record<string, DestinationProfile>,
): HandResult {
  const cheapestPerDest = new Map<string, FareSnapshotEntry>();
  for (const e of snapshots) {
    const current = cheapestPerDest.get(e.destination);
    if (!current || totalWithBag(e.offer) < totalWithBag(current.offer)) {
      cheapestPerDest.set(e.destination, e);
    }
  }

  const ranked = [...cheapestPerDest.values()]
    .map((e) => {
      const profile = profiles[e.destination];
      if (!profile) return null;
      const signal = buildSignal(e.offer);
      const fare = fareMoment(signal);
      const surprise = unexpectedness(taste, profile.tags);
      const affinity = (tagScore(taste, profile.tags) + surprise) / 2;
      return {
        destination: e.destination,
        cityName: profile.cityName,
        city: profile.city,
        hasCityFile: profile.hasCityFile,
        offer: e.offer,
        totalWithBag: totalWithBag(e.offer),
        score: W_TASTE * affinity + W_FARE_MOMENT * fare,
        novelTags: [] as VibeTag[],
        sealed: false,
      };
    })
    .filter((x): x is RankedDeal => x !== null)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.totalWithBag - b.totalWithBag ||
        a.destination.localeCompare(b.destination),
    );

  const top = ranked.slice(0, 3);
  const handTags = new Set(top.flatMap((d) => profiles[d.destination]!.tags));

  const rest = ranked.slice(3);
  let wildcard: RankedDeal | undefined;
  let bestSurprise = -Infinity;
  for (const cand of rest) {
    const profile = profiles[cand.destination]!;
    if (!profile.hasCityFile) continue;
    const surprise = unexpectedness(taste, profile.tags);
    cand.novelTags = profile.tags.filter((t) => !handTags.has(t));
    if (surprise > bestSurprise) {
      bestSurprise = surprise;
      wildcard = cand;
    }
  }
  if (!wildcard) {
    wildcard = rest[0];
    if (wildcard) {
      const profile = profiles[wildcard.destination]!;
      wildcard.novelTags = profile.tags.filter((t) => !handTags.has(t));
    }
  }
  if (!wildcard) throw new Error("rankHand needs at least 4 destinations");
  wildcard.sealed = true;

  return { top, wildcard };
}

/**
 * FR-011: the observed-fare badge needs >= 7 distinct nights of real snapshot
 * history. Fixture-mode entries never count.
 */
export function observedNights(snapshots: FareSnapshotEntry[], destination: string): number {
  const nights = new Set(
    snapshots
      .filter((e) => e.destination === destination && e.mode === "cli")
      .map((e) => e.fetchedAt.slice(0, 10)),
  );
  return nights.size;
}

export function showObservedBadge(snapshots: FareSnapshotEntry[], destination: string): boolean {
  return observedNights(snapshots, destination) >= 7;
}
