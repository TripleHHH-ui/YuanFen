# Qoder evidence checklist

**Why this file exists:** the "Use of Qoder" score is a gate, not a sliding scale — under 80% of core functionality built in Qoder and the *entire* 20%/8-point category scores 0. This isn't a claim you get to assert; it needs to be evidenced. Check these off as you go, don't reconstruct them the night before submission.

- [ ] **First commit onward is in Qoder.** Core functionality development happens inside Qoder from day one — the team portal's own R&D metrics become the evidence, not a written claim.
- [ ] **Spec-driven sequence followed end to end:** PRD → generated SPECS → UI/UX doc → tech design → task decomposition → per-feature implementation quests → harness practices → L1/L2/L3 scans → knowledge plan.
- [ ] **Quest history exported/screenshotted** as it's produced, not reconstructed after the fact.
- [ ] **Three sub-agents live and routed by cost:** `FareBoardAgent`, `RouteAgent`, `TasteAgent` — cheap tier for routine work, expensive tier reserved for the graph re-plan logic in `RouteAgent`.
- [ ] **The nightly fare-board job runs as a Qoder Scheduled Task** (see `infra/scheduled-tasks/`) with the Atlas Skill available to every run — this makes the data pipeline itself visible, auditable Qoder work, not an invisible cron job.
- [ ] **L1–L3 safety scans run and findings fixed between runs** on: Atlas CLI credential handling, zero-logging of passenger details, and the chat parser's injection surface.
- [ ] **Portal metrics screenshotted** close to submission time as the final % evidence.

## Also worth confirming at the 19 Aug workshop

- The Qoder scoring table's own numbers don't quite add up as published (AI Development 0–4 + Agent Technology 0–6 = 10, but the category caption says "capped at 8") — ask rather than assume which number is authoritative.
- How Qoder usage should be evidenced in the submission: inside the 3-minute video itself, or as a separate attachment.
