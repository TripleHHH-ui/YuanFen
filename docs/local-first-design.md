# Local-first build — design

*2026-08-24. Companion to `architecture.md` (the concept) — this file pins the concrete stack and
module design for the local-first vertical slice built on JK's machine, so the team can review it
and re-drive the same design through Qoder quests for the evidence gate.*

## Goal

One golden path, end to end, fully runnable offline on a laptop: onboarding → S1 chat route →
S3 unprompted long-weekend alert → booking checkpoint → S4 flight-swap reflow — with
`ATLAS_MODE=fixture` (labeled fixture fares shaped exactly like the real CLI envelope), and a
drop-in `ATLAS_MODE=cli` that shells to the authorized `atlas-flight` CLI with zero app changes.

## Stack

| Piece | Choice | Why |
|---|---|---|
| Monorepo | npm workspaces: `apps/web`, `apps/api`, `packages/shared` | one `npm install`, one language |
| API | Node 24 + TypeScript + Fastify, `tsx` dev runner | tiny, fast, typed |
| Web | Vite + React + TS, zustand, MapLibre GL JS | per README; zustand keeps trip-graph state out of prop drilling |
| Basemap | Carto Positron raster (no key), desaturated | "the route owns the color" |
| Tests | Vitest on `packages/shared` + api logic | engine correctness is the demo |
| LLM | none in the request path (see below) | demo determinism + settlement rule |

**No LLM in the running app.** S1 parsing is a deterministic intent parser (area/must/mood
grammar) and narration is template-composed from the graph delta. Both sit behind interfaces
(`IntentParser`, `Narrator`) so a Qwen/Claude call can replace either later without touching the
graph engine. This is a feature for the demo (same input → same route every take) and it keeps
the settlement path trivially clean.

## packages/shared — the trip graph

```ts
TripGraph {
  id, origin: "SIN", destination, window: {start, end, holiday?},
  flight: FlightNode,            // node zero: offerId, carrier, times, fareTotalWithBag, currency
  days: DayPlan[],               // each: date, stops: StopNode[]
  budget: { flight, ground, total, currency },
  narration: string,             // exactly one sentence, always
}
StopNode { placeId, arrive, depart, travelMinFromPrev, role: "anchor"|"food"|"quiet"|"wildcard"|"must", sealed?: boolean }
TasteVector = Record<VibeTag, number>   // 12 tags, swipes move weights
```

Pure functions, no I/O: `buildDays(flight, places, matrix, taste, constraints)`,
`reflow(graph, newFlight) → {graph', delta, changedStops}`, `scorePlace/scoreDestination(taste, …)`,
`applySwipe(vector, card, action)`, `longWeekends(holidays, from)`. All Vitest-covered:
arrival-time shaping (FR-013), must-go guarantee-or-explain (FR-012), budget math (FR-014),
opening-hours validity (FR-005), undo (FR-003).

## apps/api

- `atlas/` — `AtlasClient` interface mirroring the official CLI contract (search, offer list/verify,
  baggage list, order create, pay, status; one envelope, branch on `code`, IDs opaque).
  `FixtureAtlasClient` serves deterministic sandbox-shaped fixtures and stamps `mode:"fixture"`;
  `CliAtlasClient` spawns `atlas-flight … --json`. Selected by `ATLAS_MODE`.
- `agents/fare_board.ts` — nightly batch: candidate set SIN → {DPS, DAD, CNX, HKT, PEN, KUL, BKK, TPE},
  long-weekend + rolling-weekend windows, exponential backoff on retryable codes, writes
  timestamped snapshots to `data/fares/snapshots/`. Runnable as `npm run fareboard` (locally) and
  as the Qoder Scheduled Task later.
- `agents/route_agent.ts` — orchestrates shared `buildDays`/`reflow` over places + matrices.
- `agents/taste_agent.ts` — swipe events → vector; serves deck cards.
- `evidence.ts` — in-memory ring log of every Atlas call {request_id, ts, op, env, mode} (FR-018).
- REST: `/api/meta/vibes`, `/api/taste/deck|swipe|vector`, `/api/plan/chat`, `/api/fareboard/alert`,
  `/api/trips` + `/:id` + `/:id/swap-flight`, `/api/booking/verify|order|pay`, `/api/evidence`.
- Booking route handlers are a fixed state machine (verify → confirm-price? → summary → pay);
  passenger details pass through to the client and are never logged or persisted (L2 rule).

## apps/web — five surfaces

1. **Onboarding** — vibe picker (12 tags, min 5, FR-002) → taste deck (15 cards, like/pass/must-go,
   undo, progress, animated taste meter, FR-003).
2. **Map home** — MapLibre, chat bar (S1), numbered route + leg times, swipeable alternatives
   (FR-006), sealed wildcard (FR-007).
3. **Alert (S3)** — long-weekend hand: 3 destination cards + 1 sealed wildcard, headline price =
   total-with-bag (FR-010), FIXTURE badge when applicable; a card expands into a full TripGraph view.
4. **Trip view** — flight strip (swap affordance), day timeline, budget bar, single narration line;
   swap → animated reflow + budget delta (S4, FR-013/014).
5. **Booking modal + evidence panel** — shared checkpoint state machine (FR-015/016), request log (FR-018).

## data/ (checked in, offline)

- `places/singapore.json` (~35 curated real places, CBD-weighted, vibe-tagged, opening hours) and
  `places/{da-nang,bali,chiang-mai,kuching}.json` (~14 each) — curated extracts in Foursquare-OSP
  shape; enrichment provenance noted per file.
- `routing/*.json` — pairwise minute matrices per city, generated by `scripts/build-matrix.mjs`
  against the public OSRM demo server at build time (checked in; regeneration optional).
- `holidays/sg.json` — 2026–2027 from mom.gov.sg (source URL + fetched-at inside). Deepavali
  observed Mon 2026-11-09 → the demo's November long weekend is Sat 07 – Mon 09 Nov 2026.
- `fares/fixtures/` — offer/verify/order/pay/status envelopes per the CLI contract;
  `fares/snapshots/` — fare-board output (fixture runs are labeled).

## The Qoder-gate caveat (team decision needed)

"Use of Qoder" is a gated 20%: under 80% of core functionality built in Qoder, the category
scores 0. This local-first slice is built in Claude Code. Options the team can take: (a) treat
this as the reference spec + data layer and re-drive the app code through Qoder quests
(PRD → SPECS → tasks → implement), which the docs here are structured to feed; (b) accept the
category loss and bank on Innovation/Feasibility/Demo (24 of 30+30+20 needed just to tie option
(a) at 80%). The build keeps every module small and spec-mapped (FR ids in comments) to make (a) cheap.
