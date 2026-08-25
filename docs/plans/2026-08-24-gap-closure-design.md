# Gap closure — design spec

*2026-08-24. Design for the two features locked in the 20 Aug session (`YuanFen_Chat_Archive.md`,
`YuanFen_Brief.html`) that the local-first build (`docs/local-first-design.md`) does not implement:
**S2 — swipe-to-future-trip** and the **fare-moment algorithm**. Design only — no code written
against this spec yet. Hand to `writing-plans` → `executing-plans`/`subagent-driven-development`
when resuming. Both gaps are additive: nothing here changes the 51 currently-passing tests or the
FR-001..018 contract in `docs/PRD.md`; it extends them.*

## New functional requirements (append to docs/PRD.md)

| FR | Requirement | Acceptance criteria |
|---|---|---|
| FR-019 | **Swipe-to-future-trip.** From any point in the app, a user can open a destination's place deck ahead of visiting (not just the home-city deck) and swipe like/pass/must-go on its cards. Must-go picks for a destination persist keyed to that destination. | A destination deck exists per city in `data/places/*.json`; swipes on it write to a per-destination must-go list, separate from the home taste vector's `mustGo[]`; persists across a session (server-side, keyed by destination id). |
| FR-020 | **Auto-populate on arrival.** When a TripGraph is built or reflowed for a destination that has pre-swiped must-go places, those places are included in the day plan at their nearest feasible slot (proximity to adjacent stops, subject to opening hours) — same guarantee-or-explain rule as FR-012. | `buildTrip`/`buildDayRoute` accept a destination-scoped `mustPlaceIds` seeded from FR-019's stored list, with no separate code path from a chat-supplied must; explanation copy distinguishes "pre-swiped" from "chat-requested" must-gos. |
| FR-021 | **Fare-moment score.** Fare-board ranking incorporates a distress/scarcity signal derived from raw Atlas search fields (`seatCount`, fare-family price spread, `refundRules` restrictiveness), not price alone. | `fareMoment(offer, familySiblings, rules)` returns a 0–1 score; `rankHand` blends it with taste score via a documented, tunable weight; a fixture-mode offer without these fields degrades gracefully (score defaults to a neutral 0.5, never crashes). |
| FR-022 | **Unexpectedness score.** Destination ranking penalizes surface-similarity to what the user has already expressed liking (via swipes or must-go), per the "high affinity + low surface similarity" definition from the design chat. | `unexpectedness(taste, destinationTags, seenTagsHistogram)` — a destination whose tags are a strict subset of already-heavily-weighted tags scores lower than one introducing 1–2 new tags at similar affinity. Feeds the wildcard selection (already partially doing this via `novelTags` in `fareboard.ts`) and now also the top-3 ranking, not just the wildcard. |

Non-goals for this pass: archetype library (8–12 precomputed traveler archetypes) — the brief
treats this as a stretch/future refinement, not core to the demo; raw `search.do` integration in
`CliAtlasClient` (still uses the Skill/CLI, which strips these fields — see Data below).

## S2 — swipe-to-future-trip

### Why it's not a bolt-on
It reuses everything: `TasteAgent`'s swipe/undo machinery (per-destination instead of per-home-city),
and `RouteAgent`'s must-go guarantee-or-explain (already generic over `mustPlaceIds`, per
`route.ts:BuildTripInput.mustPlaceIds`). The gap is state, not logic: today `mustGo` lives on the
single home `TasteState`; it needs to become destination-scoped.

### Data model changes (`packages/shared/src/types.ts`)
```ts
// Replace TasteState.mustGo: string[] with:
export interface TasteState {
  vector: TasteVector;
  mustGoByDestination: Record<string, string[]>; // key: city id, e.g. "da-nang"
  swipeCount: number;
  history: Array<{ vector: TasteVector; mustGoByDestination: Record<string, string[]> }>;
}
```
`applySwipe`/`undoSwipe` (`packages/shared/src/taste.ts`) gain a `destination: string` param
(default `"home"` for the existing onboarding deck, preserving current tests — audit
`packages/shared/test/taste.test.ts` for the signature change and update call sites, don't
silently widen the type). `scorePlace` is unaffected.

### API (`apps/api/src/agents/taste_agent.ts`, `apps/api/src/routes.ts`)
- `GET /api/taste/deck/:destination` — reuses `tasteDeck()`'s bucket-round-robin logic against
  `loadCity(destination).places` instead of hardcoded `singapore`.
- `POST /api/taste/swipe` gains `destination` in the body (optional, defaults `"home"`).
- `swapFlight`/`createTripFromDeal` in `route_agent.ts` already call `buildTrip({ ..., mustPlaceIds })`
  — change the source of `mustPlaceIds` from the flat home list to
  `tasteState().mustGoByDestination[destination] ?? []`, merged with any chat-supplied musts.

### UI
New component `components/plan/DestinationDeck.tsx` (same swipe-card mechanics as `TasteDeck.tsx`
— consider extracting a shared `SwipeDeck` primitive rather than duplicating the drag logic)
reachable from a trip's expanded view ("swipe {cityName} favorites for next time") and from the
deal-hand cards before expanding. Store: `useStore` gains `destinationDecks: Record<string, {deck, index}>`
and `swipeDestination(destination, action)`.

### Tests to add
`packages/shared/test/taste.test.ts`: destination-scoped must-go persists and is independent per
destination; undo restores the right destination's list. `apps/api/test/api.test.ts`: a trip built
after pre-swiping a must-go for that destination includes it without the chat/S1 path being involved.

## Fare-moment + unexpectedness algorithm

### Data constraint (read `atlas-flight-booking-skill-research.md` before touching this)
The Skill/CLI's `RoutingNormalizer` strips `seatCount`, fare-family spread, and `refundRules` —
exactly the fields fare-moment needs. Two options:
1. **(Recommended for the demo)** Extend `FixtureAtlasClient`'s fixture envelopes with these fields
   (they're fixture data anyway — nothing stops us adding realistic values) and compute
   `fareMoment` from them. `CliAtlasClient` in real Sandbox mode returns `null` for missing fields;
   `fareMoment` treats `null` as neutral (0.5), so the algorithm never breaks, it just degrades to
   taste-only ranking until raw-API integration exists.
2. Full raw `search.do` client bypassing the Skill for the fare-board path only (booking stays on
   the Skill, per the existing architecture doc's "settlement stays boring" rule). Bigger lift —
   only worth it if Sandbox testing shows the CLI's stripped fields matter in practice. Don't build
   this speculatively; ship option 1 first.

### `fareMoment` (new file `packages/shared/src/farebmoment.ts` or fold into `fareboard.ts`)
```ts
export interface DistressSignal {
  seatCount?: number | null;       // lower = scarcer
  familySpreadPct?: number | null; // (next-tier price - this price) / this price
  refundable: boolean | null;
  changeable: boolean | null;
}

export function fareMoment(signal: DistressSignal): number {
  // each present sub-signal contributes; missing ones are simply excluded from
  // the average rather than defaulting to a fixed neutral per-field (that would
  // silently bias offers with more populated fixture data). Whole function
  // returns 0.5 only when ALL sub-signals are absent.
}
```
Weight in `rankHand` (`packages/shared/src/fareboard.ts`): change the sort key from
`tagScore(taste, tags)` alone to a documented blend, e.g.
`0.65 * tagScore(taste, tags) + 0.35 * fareMoment(signal)` — **the exact weight is a product
decision, not an engineering one; pick it with JK, don't guess.** Keep it a named constant so it's
one line to tune. Existing `fareboard.test.ts` cases need their expected orderings re-derived once
this lands (currently pure taste-ranking assumptions).

### `unexpectedness`
```ts
export function unexpectedness(taste: TasteVector, destinationTags: VibeTag[]): number {
  // 1 - (avg affinity-weighted overlap with tags the user has already strongly
  // expressed, i.e. vector[tag] above some threshold). A destination whose tags
  // are entirely inside the user's already-strong tags scores near 0; one
  // introducing tags the user hasn't strongly signalled scores near 1.
}
```
Feeds into the top-3 selection in `rankHand` (currently pure `tagScore` sort) as a further blend
term, and simplifies/replaces the current ad-hoc `novelTags` wildcard-only logic in
`fareboard.ts:pickWildcard`-equivalent code — that logic was always doing a rough version of this;
formalize it into one function used by both the top-3 and the wildcard pick.

### Tests to add
`packages/shared/test/fareboard.test.ts`: fareMoment ranks a scarce/restrictive fixture offer above
an identically-priced flexible one; unexpectedness demotes a destination whose tags are a subset of
an already-maxed vector even if its taste score ties another candidate; fixture offers missing
distress fields don't crash and don't dominate/starve the ranking.

## Suggested build order (for whoever picks this up)

1. FR-021/022 (fare-moment + unexpectedness) — pure `packages/shared` logic, TDD, no API/UI
   touched yet, lowest risk, directly strengthens the "yuanfen algorithm" pitch for judges.
2. Wire the new scores into `rankHand` + fixture envelope enrichment, re-run/fix
   `fareboard.test.ts`.
3. FR-019/020 (S2) — data model + API, TDD against `taste.test.ts` and `api.test.ts`.
4. UI: `DestinationDeck.tsx` + store wiring + one entry point from the trip view.
5. Update `docs/demo-script.md` if S2 earns a beat in the video (the brief's S2 example — pre-swipe
   Tokyo, arrive, must-go already routed — needs its own ~15s if it's going on stage; confirm with
   JK before adding screen time, don't assume).

Rough scope signal, not a token quote: step 1 is comparable in size to the original
`packages/shared/test/fareboard.test.ts` pass; steps 3–4 are comparable to Task 3 + Task 8 from
`docs/plans/2026-08-24-local-first-mvp.md` combined.
