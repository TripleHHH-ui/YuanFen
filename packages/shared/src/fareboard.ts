import type { FareSnapshotEntry, FlightOption, TasteVector, VibeTag } from "./types.js";

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

export function totalWithBag(offer: FlightOption): number {
  return offer.price.base + (offer.bags.included ? 0 : offer.bags.checked_fee);
}

function tagScore(taste: TasteVector, tags: VibeTag[]): number {
  let s = 0;
  for (const t of tags) s += taste[t];
  return s / Math.sqrt(tags.length || 1);
}

/**
 * FR-009: rank stored snapshots against the taste vector. Pure ranking — no
 * live fare call belongs anywhere near this function. FR-010: headline number
 * is always total with checked bag.
 *
 * Hand = top 3 by taste score (ties -> cheaper total first, then IATA).
 * Wildcard = best-ranked remaining destination that (a) has full trip data so
 * the sealed card can expand into a real planned trip, and (b) introduces at
 * least one vibe tag the open hand doesn't already cover.
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
      return {
        destination: e.destination,
        cityName: profile.cityName,
        city: profile.city,
        hasCityFile: profile.hasCityFile,
        offer: e.offer,
        totalWithBag: totalWithBag(e.offer),
        score: tagScore(taste, profile.tags),
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
  const wildcard =
    rest.find((cand) => {
      const profile = profiles[cand.destination]!;
      if (!profile.hasCityFile) return false;
      cand.novelTags = profile.tags.filter((t) => !handTags.has(t));
      return cand.novelTags.length > 0;
    }) ?? rest[0];
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
