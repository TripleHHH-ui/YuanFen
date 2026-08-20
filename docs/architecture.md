# Architecture

## The core model: one trip graph, flight as node zero

The trip is one directed graph, not a flight tab bolted onto a planner:

- **Node zero is the flight.** Every ground stop is downstream of it.
- **A taste vector**, learned from swipes, ranks both sides of the graph — places and fares.
- **One budget** spans air plus ground. Swapping the flight visibly re-plans the days and moves the budget by the fare delta.

Remove the fare engine and the product doesn't lose a feature — it loses its spine. The integration between flights and itinerary is structural, not cosmetic, and it's the direct build of the judging rubric's own published example: *"treat the itinerary as a dependency graph, re-plan every downstream leg when something changes."*

## Five mechanics this unlocks

1. **The fare spawns the map.** A flight card is a trip seed, not a search result — swiping right on a matched fare opens a map already populated with a day-by-day route for those exact dates.
2. **Arrival time shapes day one.** A 09:30 landing generates a full first day; a 23:40 landing generates a night-food stop and a slow morning.
3. **Re-plan propagation (the level-4 moment).** Switch flights, the ground plan reflows with the budget delta, narrated in one sentence.
4. **One honest budget.** Flights rank on true total cost (fare + checked bag from the ancillary catalogue), and fare savings become visible, spendable itinerary budget.
5. **The calendar-aware proactive loop.** A nightly fare board + the public-holiday calendar + the taste vector let the product move first — the alert always delivers a planned trip, never a bare price.

## Data & integration surface

| Layer | Source | Notes |
|---|---|---|
| Flights | Atlas API via the official `atlas-flight-booking-skill` | Search, offer verify, ancillary catalogue, order, balance pay, ticketing poll. All demo bookings run in Atlas Sandbox. |
| Map render | MapLibre GL JS | Free-tier tiles, desaturated so the route owns the color. |
| Places | Foursquare Open Source Places (Apache 2.0) | Preloaded for demo cities, enriched offline with vibe tags + opening hours. |
| Routing | OSRM or openrouteservice (OSM-based) | Pairwise travel-time matrices precomputed per city so interactive planning answers in under 5 seconds. |
| Holidays | Static file, official public-holiday list | Refreshed at build time — never sourced from model memory. |

## Why batch-plus-rank, not live fan-out

Atlas's rate limits (daily search cap, per-second cap, search-to-order ratio guard) mean the architecture cannot fire a live Atlas search per user action. Instead:

- A **nightly scheduled job** (a Qoder Scheduled Task — see `infra/scheduled-tasks/`) walks a fixed candidate set: one origin, 5–8 destinations, the long-weekend windows plus rolling weekends. It backs off on limit responses and stores timestamped fare snapshots.
- The **per-user step is pure ranking** against the taste vector over those stored snapshots — no live API call in the request path.

This isn't a hackathon shortcut — it's the same shape a real travel seller would run in production, and it keeps unit cost near zero. It's also the direct answer to the Feasibility rubric's "Operating Scale" and "Cost Controllability" sub-dimensions.

## Why settlement is boring on purpose

The agent plans and watches with full autonomy. The settlement path is deliberately **fixed, deterministic code with human checkpoints**: offer re-verification, explicit re-confirmation on any price increase, a masked order summary, and a single-use payment approval phrased as consent to the exact displayed total. No free-form generation composes any value inside order creation or payment.

This matters mechanically: the rubric halves the AI multiplier for free-form generation inside a funds-settlement step. Autonomy lives in `RouteAgent` and `FareBoardAgent`; `atlas_skill` stays boring. The constraint becomes the trust story, not a limitation to hide.

## The three agents

- **`FareBoardAgent`** — runs the nightly batch job, calls the Atlas Skill, writes fare snapshots. Cheap model tier — this is retrieval/storage, not reasoning.
- **`RouteAgent`** — owns the graph re-plan/reflow logic: given a flight (existing or swapped), builds/rebuilds the downstream day plan from places + travel-time matrices + taste ranking. This is the one workload that gets the expensive model tier.
- **`TasteAgent`** — turns swipe events into the taste vector used by both `RouteAgent` (place ranking) and `FareBoardAgent`'s snapshot ranking (fare/destination matching).
