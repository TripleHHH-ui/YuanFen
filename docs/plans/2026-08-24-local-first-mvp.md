# YuanFen Local-First MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. This plan is also the
> task-decomposition input for the team's Qoder quest re-drive (one quest per task).

**Goal:** A fully offline-runnable vertical slice of the 3-minute demo golden path: onboarding →
S1 chat route → S3 long-weekend alert → booking checkpoint → S4 flight-swap reflow.

**Architecture:** npm-workspaces monorepo. Pure trip-graph engine in `packages/shared` (TDD'd),
Fastify API in `apps/api` with pluggable AtlasClient (fixture | cli), React+MapLibre UI in
`apps/web`. All demo data checked into `data/`. No LLM in the request path; parser + narrator are
deterministic behind swappable interfaces.

**Tech Stack:** Node 24, TypeScript, Fastify, Vitest, Vite, React 18, zustand, MapLibre GL JS.

FR references = `docs/PRD.md`.

---

### Task 1: Monorepo tooling
**Files:** create `package.json` (workspaces: `apps/*`, `packages/*`), `tsconfig.base.json`,
`packages/shared/package.json`, `packages/shared/tsconfig.json`, `apps/api/package.json`,
`apps/web` via `npm create vite`.
- [x] Root scripts: `dev` (concurrently api+web), `test` (vitest run in shared+api), `fareboard`.
- [x] Verify: `npm install` clean; `npm test` runs (0 tests).

### Task 2: Data layer — holidays, places, matrices, fare fixtures
**Files:** `data/holidays/sg.json` (from mom.gov.sg, source+fetchedAt fields; Deepavali observed
2026-11-09), `data/places/singapore.json` (~35 places: CBD anchors, chicken-rice spots incl.
Maxwell/Tian Tian, quiet spots incl. gardens/temples; each: id, name, lat/lng, vibeTags[],
openHours per weekday, priceBand, estCostSGD, estStayMin), `data/places/{da-nang,bali,chiang-mai,kuching}.json`
(~14 each), `data/fares/fixtures/{search,verify,order,pay,status}/*.json` (exact CLI envelope:
schema_version/status/code/message/retryable/request_id/data), `scripts/build-matrix.mjs` +
`data/routing/{city}.json` (minutes, walking<=2km walk-speed, else OSRM demo-server driving).
- [x] Verify: JSON parses; every place has coords within city bbox + 7-day openHours; matrix is
      NxN matching places file order; fixtures round-trip through the envelope type.

### Task 3: Shared engine — taste (TDD)
**Files:** `packages/shared/src/{types.ts,taste.ts}`, `test/taste.test.ts`.
- [x] Tests first: vibe-pick seeding (5 tags → positive weights); `applySwipe` like/+, pass/−,
      must-go/strong+ and records mustGo placeId; undo restores exact prior vector; `scorePlace`
      ranks a food-tagged place above park for food-heavy vector; deterministic.
- [x] Implement minimal `taste.ts`; all green.

### Task 4: Shared engine — long weekends + fare ranking (TDD)
**Files:** `packages/shared/src/{calendar.ts,fareboard.ts}`, tests.
- [x] Tests: `longWeekends(holidays, from)` finds Deepavali Sat07–Mon09 Nov 2026 from 2026-08-24;
      ignores past holidays; Fri/Mon-adjacent detection. `rankHand(snapshots, taste)` returns top-3
      + 1 sealed wildcard (taste-novel: high tag-adjacency, not in top-3, not lowest-price);
      headline = fare+bag (FR-010); deterministic for fixed inputs.
- [x] Implement; green.

### Task 5: Shared engine — route build + reflow (TDD, the core)
**Files:** `packages/shared/src/{route.ts,narrate.ts}`, tests.
- [x] Tests: `buildDays` — 09:30 arrival → full day-1 (≥3 stops); 23:40 arrival → night-food stop
      + slow morning (day-1 ≤1 stop after 21:00, day-2 starts ≥10:00) (FR-013); every stop open at
      scheduled time (FR-005); mustGo included or `explanations[]` has exactly one line (FR-012);
      travel legs from matrix; wildcard present + sealed (FR-007); alternatives differ ≥2 stops
      (FR-006). `reflow` — swap late→early flight regrows day-1, keeps day-2 identity, budget
      delta = fare delta (FR-014); `narrate(delta)` returns exactly one sentence naming time and
      money change.
- [x] Implement greedy slot-filler over taste-ranked open places + template narrator; green.

### Task 6: API — AtlasClient (fixture + cli) & evidence log
**Files:** `apps/api/src/atlas/{types.ts,fixture.ts,cli.ts,index.ts}`, `apps/api/src/evidence.ts`,
`test/atlas.test.ts`.
- [x] Envelope types mirror cli-contract.md; `FixtureAtlasClient` serves fixtures, generates
      request_ids, verify supports a price-increase scenario flag; `CliAtlasClient` spawns
      `atlas-flight <args> --json` (untested locally, guarded); every call appends
      {request_id, ts, op, env, mode} to evidence ring (FR-018). Passenger payloads excluded from log.
- [x] Tests: fixture search returns offers; evidence grows; passenger details never in log output.

### Task 7: API — agents + routes
**Files:** `apps/api/src/agents/{taste_agent.ts,route_agent.ts,fare_board.ts}`,
`apps/api/src/{server.ts,routes.ts,intent.ts}`, `test/{intent,api}.test.ts`.
- [x] `intent.ts`: deterministic parser — city/area match, "must (eat|see|visit) X" clauses, mood
      words → vibe tags; S1 demo phrase test (FR-004). FareBoard job: candidate set, backoff on
      retryable, snapshot files (FR-017). REST endpoints per design doc; booking state machine
      verify→(confirm-price)→summary→pay with exact-total consent token (FR-015/016).
- [x] Tests: S1 phrase → CBD day plan JSON with chicken-rice stop + quiet closer; alert endpoint
      returns 3+1 hand; swap-flight returns delta + one narration line; booking happy path returns
      order_no/pnr/ticket from fixtures.

### Task 8: Web — onboarding (vibes + deck)
**Files:** `apps/web/src/{App,store,api}.ts(x)`, `components/onboarding/{VibePicker,TasteDeck,TasteMeter}.tsx`.
- [x] 12 tags, Continue gated at 5 (FR-002); 15-card deck with drag/buttons, like/pass/must-go,
      undo, n/15 counter, animated meter (FR-003). Verify in browser.

### Task 9: Web — map home + S1 route + alternatives + wildcard
**Files:** `components/map/{MapCanvas,RouteLayer,StopMarkers}.tsx`, `components/narration/NarrationStrip.tsx`,
`components/plan/{ChatBar,RouteCard,AlternativesSwiper}.tsx`.
- [x] Carto Positron basemap desaturated; numbered stops + leg times; chat bar drives /api/plan/chat;
      swipe cycles alternatives redrawing map (FR-006); sealed wildcard reveals on tap (FR-007).

### Task 10: Web — S3 alert, trip view, S4 reflow
**Files:** `components/deck/DealHand.tsx`, `components/trip/{TripView,FlightStrip,DayTimeline,BudgetBar}.tsx`.
- [x] Unprompted alert banner → hand of 3+sealed wildcard, FIXTURE badge, total-with-bag headline,
      no prediction copy (FR-008/009/010); card expands to TripView; flight strip swap → animated
      day-1 reflow + budget bar delta + one narration line (FR-013/014).

### Task 11: Web — booking checkpoint + evidence panel
**Files:** `components/booking/{BookingFlow,MaskedSummary,ResultScreen}.tsx`, `components/evidence/EvidencePanel.tsx`.
- [x] Shared state machine: verify → price-change reconfirm → masked summary → "I approve this
      exact payment of {total}" → order/PNR/ticket + env label (FR-015/016); evidence panel lists
      atlas calls with mode badges (FR-018).

### Task 12: Verify end-to-end + polish
- [x] `npm test` all green; `npm run dev`; walk the golden path in browser (Playwright screenshots):
      onboard → S1 → S3 → expand → book → swap. Fix visual breaks. Update README run instructions.

### Task 13 (stretch): fare-board nightly runner + 7-night badge logic
- [x] `npm run fareboard` writes dated snapshot; badge logic reads snapshot history count, fixture
      mode never shows badge (FR-011). Test: 6 nights → no badge, 7 → badge.
