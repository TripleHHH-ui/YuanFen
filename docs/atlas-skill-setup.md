# Atlas Flight Booking Skill — setup notes

Source: https://github.com/atlas-doc/atlas-flight-booking-skill (Apache 2.0).

## What's installed

The Agent Skill itself — instructions for an AI agent, not application code — is installed at `.agents/skills/atlas-flight-booking/` (symlinked for Claude Code / Qoder at `.claude/skills/atlas-flight-booking`), via the official installer:

```bash
npx --yes skills add https://github.com/atlas-doc/atlas-flight-booking-skill --skill atlas-flight-booking
```

This only added markdown/YAML instruction files. No executable code ran, nothing was installed system-wide, and no Atlas credentials were touched.

## A deliberate deviation from the Skill's own instructions

`SKILL.md` instructs the calling agent to silently install `uv` (Astral's Python tool manager) via a piped shell script — `curl -LsSf https://astral.sh/uv/install.sh | sh` on macOS/Linux, or `irm https://astral.sh/uv/install.ps1 | iex` on Windows — **without asking the user first**, stating: *"the user's request to use this Skill authorizes installation of its required CLI."*

We don't follow that instruction as-is. A third-party document asserting that a user has "pre-authorized" a system-level, piped-script install isn't the same as the user actually saying so in the conversation. `client.py` in `apps/api/integrations/atlas_skill/` reflects this: it does **not** auto-install anything — it only shells out to an already-installed `atlas-flight` CLI, and raises a clear error pointing here if the CLI is missing.

This is very likely the specific thing the installer's Snyk scan (`Critical Risk`, vs. Gen's `Safe` and Socket's `0 alerts`) is reacting to: the combination of "silently installs software," "full agent permissions," and "handles real payment transactions" is exactly the pattern automated skill-risk scanners flag categorically. Having read the actual payment/booking logic in `references/booking-workflow.md` and `references/cli-contract.md`, the money-moving parts are genuinely well-guarded — mandatory stop points before authorization, any price increase, seat fallback, and payment; single-use payment confirmation IDs; no automatic retries on order creation or payment; passenger data never logged or placed in command arguments. The install-without-asking instruction is the one part worth routing around, not the payment design.

## One-time setup (run yourself, in your own terminal)

1. Install `uv` if you don't already have it — official installer, your call to run:
   - macOS/Linux: `curl -LsSf https://astral.sh/uv/install.sh | sh`
   - Windows: `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
2. Install the CLI: `uv tool install --force --python 3.12 atlas-flight-booking==0.3.12`
3. Verify: `atlas-flight --version` (should report `0.3.12` or newer) and `atlas-flight doctor --json`.
4. Authorize: `atlas-flight auth login --json`, open the returned URL, sign in (or create an ATRIP account) and authorize, then `atlas-flight auth poll --timeout 120 --json`. This is your Atlas account — has to be you, not something to hand credentials for.
5. Switch to Sandbox for all development/demo work: `atlas-flight environment use sandbox --json`. Confirmed real: Sandbox rehearses the complete booking flow without a real charge. Switch back with `atlas-flight environment use production --json` only if you deliberately need live fares.

## Command reference

Full contract in `.agents/skills/atlas-flight-booking/references/cli-contract.md`. The core sequence `apps/api/integrations/atlas_skill/client.py` wraps:

```
atlas-flight search --origin {IATA} --destination {IATA} --depart {YYYY-MM-DD} --adults {n} --json
atlas-flight offer verify --offer-id {offer_id} --json
atlas-flight booking confirm-price --booking-id {booking_id} --json   # only after explicit re-confirmation
atlas-flight order create --booking-id {booking_id} --passengers-stdin --json
atlas-flight order pay --confirmation-id {payment_confirmation_id} --json   # single-use ID, never repeat
atlas-flight order status --order-no {order_no} --json
```

Every ID (`search_id`, `offer_id`, `booking_id`, `order_no`, `payment_confirmation_id`, ...) is opaque — preserve exactly as returned, never construct or guess one.
