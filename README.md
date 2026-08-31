# YuanFen 缘分

> The trip is one graph. The flight is node zero. Swipe your taste once, and the agent plans the ground, watches the calendar, catches the fare, and re-plans everything downstream when anything changes.

Built for the **Alibaba Cloud × Atlas Agentic AI Hackathon** (WiT Singapore). Track: travel AI agent on Atlas flight APIs, Alibaba Cloud, and the Qoder platform.

---

## For judges — the live demo

**▶ http://47.245.82.206/** — deployed on Alibaba Cloud ECS (Singapore). Nothing to install.

Source: this repo, `main`. Deployed straight from it via `infra/deploy/bootstrap.sh`.

### The 60-second path

1. **Pick 5 vibes**, then **swipe the deck** — this trains the taste vector that ranks everything after it.
2. Type the S1 phrase: *"Day trip in Singapore CBD, must eat chicken rice, then somewhere quiet"* — the agent returns a **route**, not a paragraph: real coordinates, real opening hours, real travel times between stops.
3. **The long-weekend alert arrives unprompted (S3).** Nobody asked for it. The agent watches the SG holiday calendar against the nightly fare board and speaks up on its own — Deepavali, 7–9 Nov, with a ranked hand of destinations your swipes actually justify.
4. Expand a card, then **swap the flight (S4)**. Day one reflows downstream, the budget delta updates, and the agent narrates the change in one line. This is the rubric's own published "level 4" example, built as the core mechanic.
5. **Book:** verify → masked summary → explicit exact-total consent → Sandbox order / PNR / ticket.
6. Open **receipts** for the evidence log — every Atlas call the session made.

### What is real, and what is labeled

The demo runs `ATLAS_MODE=fixture`: flight offers come from checked-in Atlas envelope fixtures and **every one of them carries a visible FIXTURE badge**. That is a standing rule in this repo — nothing is mocked without a label on screen. Flipping to `ATLAS_MODE=cli` points the same code at the authorized Atlas Sandbox CLI with zero application changes.

Everything else is genuinely real: places and coordinates from Foursquare Open Places extracts, pairwise travel-time matrices precomputed from a routing engine, and the Singapore public-holiday calendar from a static file — never from model memory.

The booking and payment path contains **no LLM output whatsoever**. It is deterministic code with human checkpoints, by design.

### Notes before you click

- **Best driven by one person at a time.** The demo keeps a single in-memory taste vector rather than per-visitor sessions, so simultaneous visitors share state. Reload and re-swipe if the deck looks like someone else's taste.
- Served over **HTTP**, so browsers will say "Not secure". There is no login and nothing is collected.
- State resets on service restart — that is expected.

Prefer to run it yourself? See [Running it](#running-it-local-first-build) below.

---

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

## Running it (local-first build)

```bash
npm install
npm test          # 51 tests: taste / calendar / fare ranking / route+reflow / atlas / api
npm run dev       # api on :8787, web on :5173
npm run fareboard # the nightly fare-board batch, manually (writes data/fares/snapshots/)
```

Open http://localhost:5173 and walk the golden path: pick 5 vibes → swipe 15 cards →
type the S1 phrase ("Day trip in Singapore CBD, must eat chicken rice, then somewhere
quiet") → the long-weekend alert lands unprompted (S3) → expand a card → swap the
flight and watch day one reflow with the budget delta (S4) → book (verify → masked
summary → exact-total consent → test order/PNR/ticket) → open "receipts" for the
evidence log.

`ATLAS_MODE=fixture` (default) runs fully offline on checked-in envelope fixtures,
labeled FIXTURE everywhere. `ATLAS_MODE=cli` shells to the authorized `atlas-flight`
CLI in Sandbox with zero app changes (do the browser authorization + 
`atlas-flight environment use sandbox` first — see the Atlas Skill user guide).

## Status

Local-first vertical slice complete (built in Claude Code as reference + spec — see
`docs/local-first-design.md` for the Qoder-gate plan and `docs/qoder-platform-notes.md`
for how to re-drive it through Qoder quests). Next: Atlas Sandbox auth on the demo
machine, Qoder quest re-drive per `docs/plans/2026-08-24-local-first-mvp.md`, demo shoot
per `docs/demo-script.md`.
