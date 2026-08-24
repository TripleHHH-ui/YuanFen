import { VIBE_TAGS, type FlightOption, type TasteVector, type TripGraph } from "./types.js";

// Deterministic template narrator. Every function returns EXACTLY one sentence
// (one terminal period, no decimals) — FR-014's "one narration line" is a hard
// product rule, and templates keep the demo repeatable. Swappable for an LLM
// behind this same interface; never inside settlement.

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function daypart(hhmm: string): string {
  const min = toMinutes(hhmm);
  if (min < 12 * 60) return "morning";
  if (min < 17 * 60) return "afternoon";
  if (min < 21 * 60) return "evening";
  return "night";
}

function weekdayName(date: string): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    new Date(`${date}T00:00:00Z`).getUTCDay()
  ]!;
}

function money(amount: number, currency: string): string {
  const symbol = currency === "SGD" ? "S$" : `${currency} `;
  return `${symbol}${Math.round(Math.abs(amount))}`;
}

export function narratePlan(graph: TripGraph, cityName: string, taste: TasteVector): string {
  const nights = Math.max(1, graph.days.length - 1);
  const topTags = [...VIBE_TAGS].sort((a, b) => taste[b] - taste[a]).slice(0, 2);
  const total = money(graph.budget.total, graph.budget.currency);
  return `A ${nights}-night ${cityName} plan built around your ${topTags[0]}-and-${topTags[1]} taste — ${total} all-in, flight and ground on one budget`.concat(
    ".",
  );
}

export function narrateSwap(
  oldOut: FlightOption,
  newOut: FlightOption,
  delta: { fareDelta: number; dayOneStopsBefore: number; dayOneStopsAfter: number },
): string {
  let landing: string;
  if (newOut.arriveDate !== oldOut.arriveDate) {
    landing = `you land ${weekdayName(newOut.arriveDate)} ${daypart(newOut.arriveLocal)} instead of ${weekdayName(oldOut.arriveDate)} ${daypart(oldOut.arriveLocal)}`;
  } else {
    const diff = toMinutes(newOut.arriveLocal) - toMinutes(oldOut.arriveLocal);
    if (diff === 0) {
      landing = `you land at ${newOut.arriveLocal} as before`;
    } else {
      const hours = Math.round(Math.abs(diff) / 60);
      const unit = hours >= 1 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${Math.abs(diff)} minutes`;
      landing = `you land ${unit} ${diff < 0 ? "earlier" : "later"}`;
    }
  }

  const { dayOneStopsBefore: before, dayOneStopsAfter: after } = delta;
  const plural = (n: number) => `${n} stop${n === 1 ? "" : "s"}`;
  const dayOne =
    after > before
      ? `day one grows from ${plural(before)} to ${plural(after)}`
      : after < before
        ? `day one slims from ${plural(before)} to ${plural(after)}`
        : `day one keeps its ${plural(after)}`;

  const currency = newOut.price.currency;
  const budget =
    delta.fareDelta > 0
      ? `the trip adds ${money(delta.fareDelta, currency)}`
      : delta.fareDelta < 0
        ? `${money(delta.fareDelta, currency)} moves back into your ground budget`
        : `the total stays put`;

  return `Swapped to ${newOut.flight_no} — ${landing}, ${dayOne}, and ${budget}.`;
}
