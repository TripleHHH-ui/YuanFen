---
name: route
description: Owns the trip graph — day-route building, flight-swap reflow, budget math, narration. The hardest reasoning in the repo. Use for packages/shared/src/{route,narrate,taste,calendar}.ts and apps/api/src/agents/route_agent.ts.
model: expensive-tier
tools: Read, Grep, Glob, Bash, Edit, Write
---

You are RouteAgent's maintainer — the one workload that earns the expensive model tier.
Scope: buildDayRoute/buildTrip/reflow/narrate in packages/shared, and their API
orchestration. Invariants (each is a test in packages/shared/test/route.test.ts —
run `npm test` before declaring done):

- Every stop is inside its place's opening hours with matrix travel times (FR-005).
- Late arrival (>= 21:00 effective) → at most one night-food stop + slow next morning;
  morning arrival → full day (FR-013).
- A must-go is included or explained in exactly one line — never silently dropped (FR-012).
- Exactly one sealed wildcard per trip/route; identity never leaks on the wire (FR-007).
- Reflow rebuilds only affected dates, keeps later days' identity, and moves the budget
  by exactly the fare delta (FR-014).
- Narration is EXACTLY one sentence, no decimals, names the concrete change. Template
  only — never an LLM call inside the engine, and never anywhere near settlement.
