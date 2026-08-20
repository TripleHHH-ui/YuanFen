# Trip Graph Agent

> The trip is one graph. The flight is node zero. Swipe your taste once, and the agent plans the ground, watches the calendar, catches the fare, and re-plans everything downstream when anything changes.

Built for the **Alibaba Cloud × Atlas Agentic AI Hackathon** (WiT Singapore). Track: travel AI agent on Atlas flight APIs, Alibaba Cloud, and the Qoder platform.

## The idea, in one paragraph

Most trip planners generate a paragraph. We generate a route: every stop comes from a real places database with real coordinates and opening hours, travel times come from a real routing engine, and the flight is not a search result sitting above the plan — it's node zero in a single dependency graph that also contains every ground stop and one shared budget. Swap the flight, and day one visibly reflows with the budget delta narrated in one sentence. That reflow is the judging rubric's own published "level 4" example, built as the product's core mechanic rather than a bolted-on feature.

Full concept brief (competitor research, UI options, architecture, demo script): see `docs/`.

## Repo structure

```
apps/
  web/            React + TypeScript frontend. MapLibre GL JS map-first UI (Option A chassis),
                  full-screen swipe deck mode (Option B), single-line agent narration overlay (Option C).
    src/
      components/map/         route rendering, swipe-to-browse alternatives
      components/deck/        taste-training deck + long-weekend deal hand (shared component, K1/B1)
      components/booking/     booking checkpoint screens (verify -> masked summary -> approve)
      components/narration/   the one-line agent narration strip
      state/                  client-side trip graph state
  api/            Backend. Owns the trip graph, the three sub-agents, and the Atlas Skill integration.
    agents/          FareBoardAgent, RouteAgent, TasteAgent
    integrations/
      atlas_skill/   wrapper around the official atlas-flight-booking-skill CLI (Sandbox only)
    routing/         OSRM / openrouteservice client + precomputed travel-time matrices
    taste/           swipe events -> taste vector, ranking logic for places and fares
data/
  places/         preloaded Foursquare Open Places extracts, per demo city
  routing/        precomputed pairwise travel-time matrices, per demo city
  holidays/       static public-holiday file (never sourced from model memory)
infra/
  scheduled-tasks/  Qoder Scheduled Task config for the nightly fare-board batch job
docs/
  PRD.md                      FR-001 to FR-018, acceptance criteria per screen
  architecture.md             the trip-graph model, node zero, batch-plus-rank pipeline
  competitor-analysis.md      the whitespace map and per-competitor table
  demo-script.md              the timed 3-minute shot list
  qoder-evidence-checklist.md what "80%+ built in Qoder" needs to produce as evidence
```

## Why this structure

- **One backend app, not microservices.** `FareBoardAgent`, `RouteAgent`, and `TasteAgent` are internal modules in `apps/api`, not separate deployables — two people in ~11 days don't need service-to-service ops overhead.
- **`atlas_skill/` is a thin wrapper, not a reimplementation.** It shells out to the official `atlas-flight-booking-skill` CLI rather than hand-rolling REST calls, per our own earlier research into that skill.
- **`data/` is checked in deliberately.** Preloaded, offline-enriched data for a short, named list of demo cities is what makes the nightly batch-plus-rank architecture (see `docs/architecture.md`) hold up against Atlas's rate limits.
- **Settlement code has no LLM in it.** Booking/payment is deterministic, fixed code with human checkpoints — the rubric halves the AI multiplier for free-form generation inside a funds-settlement step, so we designed that risk away rather than around.

## Judging alignment (quick reference)

| Dimension | What's asked | Where it lives here |
|---|---|---|
| Innovation | Itinerary as a dependency graph, re-planning downstream legs | `apps/api/agents/route_agent`, demoed as S4 in `docs/demo-script.md` |
| Feasibility | Operating scale, compliance & safety, cost controllability | `docs/architecture.md` — batch-plus-rank, rate-limit design, deterministic settlement |
| Use of Qoder (80%+ gate) | Spec-driven, agentic dev evidence, or the whole category scores 0 | `docs/qoder-evidence-checklist.md` |
| Demo | Completeness + presentation, tiered scoring | `docs/demo-script.md` |

## Status

Scaffold only — no application code yet. Next step: wire the Atlas Sandbox credentials (`.env.example`) and start on `RouteAgent`, since the reflow mechanic is the highest-leverage thing to prove works early.
