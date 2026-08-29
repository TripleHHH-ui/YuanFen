---
kind: error_handling
name: Result-Object Error Propagation with HTTP Status Mapping in Fastify Routes
category: error_handling
scope:
    - '**'
source_files:
    - apps/api/src/routes.ts
    - apps/api/src/atlas/types.ts
    - apps/api/src/agents/route_agent.ts
    - apps/api/src/agents/taste_agent.ts
    - apps/api/src/booking.ts
    - apps/api/src/server.ts
    - apps/web/src/api.ts
---

## Approach

The codebase avoids throwing exceptions for domain errors. Instead, every business function returns a **discriminated union** (a result object) that either carries the success payload or an `error` string field. Route handlers translate these result objects into HTTP responses with appropriate status codes. There is no centralized error middleware; each route handler performs its own `if ("error" in result)` check.

There is also a thin client-side fetch wrapper (`apps/web/src/api.ts`) that throws a generic `Error` when the server responds with a non-2xx status, so the frontend treats any API error uniformly as a thrown exception — callers catch it to display user-facing messages.

## Key Files and Packages

- **`apps/api/src/routes.ts`** — Central route registration. Every POST/GET handler calls a domain function, checks for an `error` property on the result, and maps it to `reply.code(400).send(result)`, `404`, or `409`. Two routes use try/catch around dynamic imports or lookups and return `{ error: "..." }` with 404.
- **`apps/api/src/atlas/types.ts`** — Defines the `Envelope<T>` contract used by the Atlas client (fixture vs CLI): `{ schema_version, status: "ok"|"error", code, message, retryable, request_id, data, details }`. Downstream code branches on `env.status === "ok"` rather than catching exceptions.
- **`apps/api/src/agents/route_agent.ts`** — Returns `{ trip?: ...; error?: string }` from `createTripFromDeal`, `{ error: string }` from `swapFlight`, and `null` from `tripView` for not-found cases. Errors are strings like `"No flights for {destination}"`, `"Unknown trip"`, `"Unknown offer for this trip"`.
- **`apps/api/src/agents/taste_agent.ts`** — Returns `{ ok: boolean; error?: string }` from `seedTaste`, `{ state; done } | { error: string }` from `swipe`/`undo`, and `null` from `tasteSummary()` when unseeded. Validation errors include `"Pick at least 5 vibes"`, `"Seed vibes first"`, `"Unknown card {id}"`.
- **`apps/api/src/booking.ts`** — State machine for booking flow. Returns `{ error: string, message?: string }` for failures such as `BOOKING_NOT_FOUND`, `PRICE_CHANGE_UNCONFIRMED`, `PASSENGERS_REQUIRED`, `CONFIRMATION_NOT_FOUND`, `CONSENT_TOTAL_MISMATCH`. Success paths forward the Atlas `Envelope`'s `code`/`message` verbatim.
- **`apps/api/src/server.ts`** — Minimal Fastify bootstrap with `logger: false`. The only top-level `.catch` logs the startup error and exits with code 1.
- **`apps/web/src/api.ts`** — Single `req<T>()` helper wraps `fetch`; if `res.ok` is false, it throws `new Error(body.error ?? String(res.status))`. All exported API methods bubble this up, so components handle errors via try/catch.

## Architecture and Conventions

1. **Domain functions never throw.** They return result objects with an `error` field (string) or a nullable value (`null`). This keeps business logic pure and testable without mocking error paths.
2. **Routes are the error boundary.** Handlers inspect results and emit HTTP status codes:
   - `400` for validation / precondition failures (e.g. missing taste seed, invalid swipe).
   - `404` for unknown resources (unknown destination, unknown place, unknown trip).
   - `409` for conflict (payment total mismatch in `payOrder`).
3. **External service errors are normalized.** The Atlas client always returns an `Envelope` with `status: "ok" | "error"`. Callers branch on `env.status` and surface `env.code` + `env.message` back to the caller as `{ error, message }`.
4. **Frontend treats all API errors uniformly.** The `req()` wrapper converts any non-2xx response into a thrown `Error` carrying the server's `error` string. UI code catches and displays it — there is no per-endpoint error type on the client.
5. **No global error middleware.** Each route handles its own mapping. There is no `app.setErrorHandler` or shared `handleError` utility.
6. **No `throw new Error(...)` in business logic.** Exceptions are reserved for truly unexpected situations (e.g. `server.ts` startup failure, CLI child process spawn errors in `atlas/cli.ts`).
7. **In-memory state uses sentinel values.** Functions like `tasteState()` and `tripView()` return `null` to signal absence of state/resource, which routes then convert to 404/400 responses.

## Rules for Developers

- When adding a new domain function, return a result object with an optional `error` string (or a discriminated union), never throw.
- In route handlers, always check `if ("error" in result)` before returning success, and map to the correct HTTP status (400/404/409).
- For external calls through `AtlasClient`, branch on `env.status !== "ok"` and propagate `env.code` + `env.message` as `{ error, message }`.
- Do not add custom error classes — keep errors as plain strings for simplicity.
- On the frontend, call endpoints via the `api.*` helpers in `apps/web/src/api.ts`; do not write raw `fetch` calls that bypass the unified error wrapper.
- If you must throw (e.g. during startup or CLI invocation), wrap it in a try/catch at the entry point and log it — never let it escape into a route handler.