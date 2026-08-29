---
kind: logging_system
name: No Structured Logging — Bare console.log in Fastify with logger disabled
category: logging_system
scope:
    - '**'
source_files:
    - apps/api/src/server.ts
    - apps/api/src/jobs/run_fareboard.ts
---

This repository does not implement a logging system. There is no dedicated logging framework, configuration file, log levels, structured log fields, or centralized logger module.

Evidence:
- `apps/api/src/server.ts` explicitly disables Fastify's built-in logger via `Fastify({ logger: false })`, then uses plain `console.log` for startup messages and `console.error` for error handling.
- `apps/api/src/jobs/run_fareboard.ts` emits its only output via `console.log` with an ad-hoc string template.
- A grep across all `.ts` files finds no imports of any logging library (no pino, winston, bunyan, debug, etc.) and no custom logger abstraction.
- No `log/`, `logging/`, or similar directories exist anywhere in the repo.
- The web app (`apps/web`) contains no server-side code that would produce logs.

Consequences:
- All runtime output goes to stdout/stderr through Node's default console, with no log levels, no structured JSON payloads, no correlation IDs, and no sink routing.
- Errors are not captured centrally; they surface as unhandled exceptions or via `console.error` calls.
- Tests do not appear to assert on log output (the test suite under `apps/api/test/` focuses on API endpoints and business logic).

Rules developers should follow (implicit convention observed):
- Do not add a logging framework unless there is a clear need — the project currently treats logging as unnecessary beyond basic startup/status prints.
- If you must emit logs, use plain `console.log` / `console.error` directly at the call site; do not create a new logger abstraction.
- Keep log lines short and human-readable; there is no structured format to conform to.