# PRD — YuanFen / Trip Graph Agent

Single source of truth for FR-001 through FR-018. Completed 2026-08-24 from the concept brief,
the architecture doc, and the demo shot list. If Qoder-generated SPECS diverge, reconcile here.

Product name: **YuanFen** (缘分 — the serendipitous meeting you didn't arrange). The agent that
moves first: it learns your taste from swipes, watches the holiday calendar and the fare board,
and speaks only when it has a fully planned trip in its hand.

## Functional requirements

| FR | Requirement | Acceptance criteria |
|---|---|---|
| FR-001 | Account-less start. First launch goes straight into onboarding — no signup, no login. A device-local profile id keys the taste vector. | Fresh browser profile reaches the vibe picker in one tap from landing; refresh keeps the learned taste (localStorage/session persistence). |
| FR-002 | Vibe picker: user must pick at least 5 of 12 vibe tags before continuing. | "Continue" stays disabled until 5+ selected; count indicator visible; selections seed the taste vector. |
| FR-003 | Taste deck: swipe session capped at 15 cards with a visible progress counter; actions are like / pass / must-go, with undo; the taste meter visibly moves as cards are swiped. | Session ends at 15 cards; counter shows n/15; undo reverses the last swipe (including its taste-vector effect); meter animates on each swipe. |
| FR-004 | Chat intent parsing (S1). A free-text request ("Day trip in Singapore CBD, must eat chicken rice, then somewhere quiet") is parsed into structured intent: area, must-eat/must-do constraints, mood qualifiers. | The S1 demo phrase parses into {city, area, constraints[], moods[]}; parse result is inspectable in the evidence panel; unparseable input degrades to a clarifying message, never a stack trace. |
| FR-005 | Route generation. Intent → an ordered day route of real places (real coordinates, real opening hours) with travel times from the routing matrix, rendered on the map with numbered stops and leg times. | Every stop exists in the places dataset with coords + hours; stops are open at their scheduled time; leg times come from the precomputed matrix, not straight-line guesses; total plan responds in < 5 s. |
| FR-006 | Alternative-route browsing. At least 2 alternative routes per request, browsable by swipe; the map redraws per alternative. | Swiping the route card cycles alternatives; each alternative differs in ≥ 2 stops or ordering; map + timeline stay in sync. |
| FR-007 | Wildcard stop reveal. Each route contains one sealed "wildcard" stop (high taste-novelty pick) that reveals on tap. | Wildcard renders sealed (no name/photo) until tapped; reveal animates; the pick scores high on taste-adjacent-but-novel ranking, not random. |
| FR-008 | Holiday-calendar watch. The agent detects upcoming long weekends from the static official holiday file and triggers the fare-board alert unprompted. | Long-weekend windows derive from `data/holidays/` (official source, checked in at build time — never model memory); the S3 alert fires without any user search; the triggering holiday is named in the alert. |
| FR-009 | Fare snapshot ranking. The alert hand = top 3 destinations + 1 sealed wildcard, ranked by taste vector against stored nightly fare snapshots. No live Atlas call in the request path. | Hand computes purely from stored snapshots + taste vector; ranking is deterministic for a given (snapshot, vector) pair; wildcard destination is sealed until tapped. |
| FR-010 | Flight card honesty. Total price including checked bag is the headline number; no prediction language anywhere on the card. | Card's primary figure = fare + checked-bag from the ancillary data; copy audit: no "will rise", "likely", "predicted", "expected to" anywhere on fare surfaces. |
| FR-011 | Baseline/observed-fare badge. A "vs. observed" badge appears only once ≥ 7 nights of real snapshot history exist for that route. | Badge hidden below 7 real nightly snapshots; fixture-mode data never produces the badge; badge copy states the observation window ("lowest of the last N nights"), not a prediction. |
| FR-012 | Must-go guarantee-or-explain. A place marked must-go (deck or chat "must…") is either in the generated route, or the plan explains in one line why not (closed that day, too far for the window). | Every must-go is present or carries exactly one explanation line; silently dropping a must-go is a test failure. |
| FR-013 | Flight swap triggers day-one reflow. Swapping the flight strip regenerates day 1's stop list for the new arrival time. | Late arrival (≥ 21:00) generates night-food stop + slow morning; morning arrival generates a full day; unaffected days keep their identity. |
| FR-014 | Reflow shows budget delta + one narration line. | Budget bar visibly moves by the fare delta (total-with-bag basis); exactly one agent sentence explains what changed and why; the sentence names the concrete change (time gained/lost, money freed/spent). |
| FR-015 | Booking checkpoint flow is shared across all UI entry points. | Same sequence regardless of where booking starts: verify offer → price-change re-confirmation if increased → masked order summary → explicit approval phrased as consent to the exact displayed total → result. One shared component/state machine. |
| FR-016 | Sandbox result display. After payment, the order number, PNR, and ticket number appear on screen. | All three identifiers rendered exactly as returned (opaque, unmodified); environment label (SANDBOX / FIXTURE) visible on the result screen. |
| FR-017 | Fare-board nightly job scope. One origin (SIN), 5–8 destination candidate set, long-weekend windows + rolling weekends; backs off on rate-limit responses; stores timestamped snapshots. | Job config lists the exact candidate set; on `retryable` limit responses it backs off (exponential, capped) rather than hammering; every snapshot carries fetched-at timestamp + environment + request ids. |
| FR-018 | Evidence panel. A toggleable panel shows the live request log: call IDs, timestamps, command/operation, environment, mode (cli/fixture). | Every Atlas-client call appears with request_id + ISO timestamp; panel distinguishes cli vs fixture calls; demo can show it in ≤ 5 seconds. |

## Non-functional / rubric-driven constraints

- **Settlement is deterministic.** No free-form generation composes any value inside order
  creation or payment (rubric halves the AI multiplier otherwise). Autonomy lives in RouteAgent
  and FareBoardAgent; the Atlas wrapper stays boring.
- **Nothing mocked without a label.** Fixture fares carry a visible FIXTURE badge on every surface.
- **Batch-plus-rank.** Atlas rate limits mean no live fan-out per user action; the per-user path
  is ranking over stored snapshots.
- **Passenger details are one-time input** — excluded from persisted state and logs (L2 scan target).

## Out of scope (this build)

Hotels, refunds/cancellations/changes, credit-card payment, multi-city, production environment,
real user accounts, push notifications (the S3 alert renders in-app).
