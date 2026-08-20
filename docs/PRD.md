# PRD — Trip Graph Agent

FR-001 through FR-018. Entries below are seeded from what the concept brief already references by number; the rest are stubs to fill in. **If a fuller PRD already exists elsewhere (e.g. Qoder-generated SPECS), paste/merge it in here instead of writing these from scratch — this file should be the single source of truth, not a second copy.**

| FR | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-001 | TBD — likely onboarding entry / account-less start | TODO | Not written |
| FR-002 | Vibe picker: user must pick at least 5 of 12 vibe tags before continuing | "Continue" stays disabled until 5+ selected | Referenced in brief |
| FR-003 | Taste deck: swipe session capped at 15 cards, with a visible progress counter; same actions (like/pass/must-go) and undo as the destination deck | Session ends at 15 cards; counter visible; undo reverses last swipe | Referenced in brief |
| FR-004–009 | TBD — likely: chat intent parsing (S1), route generation, alternative-route browsing, wildcard reveal, holiday-calendar watch trigger, fare snapshot ranking | TODO | Not written |
| FR-010 | Flight card: total price including checked bag is the headline number; no prediction language anywhere on the card | Card displays total-with-bag as primary figure; copy audit confirms no predictive claims | Referenced in brief |
| FR-011–012 | TBD — likely: baseline/observed-fare badge visibility rule, must-go place guarantee-or-explain logic | TODO | Not written |
| FR-013 | Flight swap triggers day-one reflow | Swapping the flight strip regenerates day 1's stop list for the new arrival time | Referenced in brief |
| FR-014 | Reflow shows budget delta + one narration line | Budget bar visibly moves by the fare delta; exactly one agent sentence explains the change | Referenced in brief |
| FR-015 | Booking checkpoint flow is shared across all UI options (Option A/B/C) | Same verify -> masked summary -> explicit approval -> Sandbox result sequence regardless of entry point | Referenced in brief |
| FR-016–018 | TBD — likely: Sandbox order/ticket confirmation display, fare-board nightly job scope (candidate set size, backoff behavior), evidence panel (live call IDs/timestamps) | TODO | Not written |

## Open items to resolve before/at the 19 Aug workshop

- Confirm the exact FR-004 through FR-018 wording against whatever Qoder SPECS get generated once build starts — this table should be reconciled, not maintained in parallel.
- Confirm Atlas Sandbox capabilities referenced elsewhere (test order creation end-to-end, carrier coverage for SIN departures, rate limits) — these gate several FRs above.
