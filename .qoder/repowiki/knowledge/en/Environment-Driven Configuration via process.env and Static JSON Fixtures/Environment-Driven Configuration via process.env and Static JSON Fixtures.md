---
kind: configuration_system
name: Environment-Driven Configuration via process.env and Static JSON Fixtures
category: configuration_system
scope:
    - '**'
source_files:
    - .env.example
    - apps/api/src/server.ts
    - apps/api/src/atlas/index.ts
    - apps/api/src/data.ts
    - apps/web/vite.config.ts
---

## What system/approach is used

The repository uses a **minimal, environment-variable-driven configuration system** with no dedicated config library. Runtime behavior is controlled entirely through `process.env` variables read at startup or on demand. There is no `.env` loader (no `dotenv`), no YAML/TOML/JSON config files for runtime settings, and no feature-flag framework. Instead, the app reads raw environment variables directly from Node's `process.env`.

A parallel but distinct mechanism loads **static data fixtures** from the `data/` directory using synchronous `readFileSync`, cached in-memory via `Map` instances.

## Key files and packages

- `.env.example` — single source of truth for all required/optional environment variables; documents each variable's purpose and how to obtain values (e.g., Atlas sandbox key, MapLibre tile provider, Foursquare API key, ORS API key).
- `apps/api/src/server.ts` — bootstraps the Fastify server; reads `API_PORT` (default `8787`) and logs `ATLAS_MODE` (default `fixture`).
- `apps/api/src/atlas/index.ts` — selects the Atlas backend implementation based on `ATLAS_MODE`: `cli` switches to live CLI-based booking; any other value (including unset) falls back to `FixtureAtlasClient` reading `data/fares/fixtures/searches.json`.
- `apps/api/src/data.ts` — resolves `REPO_ROOT` relative to the compiled server file, then exposes typed helpers (`loadCity`, `loadMatrix`, `loadHolidays`, `loadDestinations`) that read JSON fixtures from `data/{places,routing,holidays}` with per-city `Map` caching.
- `apps/web/vite.config.ts` — hardcodes dev server port `5173` and proxies `/api` to `http://localhost:8787`; web-side configuration is essentially zero (no env var usage in Vite config).
- `vitest.config.ts` — test runner config; tests rely on fixture data rather than env-driven behavior.

## Architecture and conventions

1. **Single source of env vars**: `.env.example` lists every supported variable. There is no schema validation, default-value enforcement, or type checking on env vars — consumers read them as strings and coerce where needed (e.g., `Number(process.env.API_PORT ?? 8787)`).
2. **Feature toggles via env**: `ATLAS_MODE` is the only feature flag in use. It is checked in `createAtlasClient()` to swap between `CliAtlasClient` and `FixtureAtlasClient`. The default (`fixture`) enables fully offline development/testing.
3. **No runtime config files**: All application behavior is driven by environment variables plus static JSON data under `data/`. There are no `config.json`, `app.yaml`, or similar files consumed at runtime.
4. **Data loading pattern**: `data.ts` computes `REPO_ROOT` from the compiled module path, joins it with `data/`, and reads JSON synchronously once per key into a `Map` cache. This avoids repeated disk I/O for city places, routing matrices, and holidays.
5. **Frontend vs backend separation**: The web app (Vite) has no runtime configuration beyond its build-time proxy config. It calls the API at `/api`, which is proxied to the local API server during development. Secrets like map tile keys would need to be injected at build time if consumed by the frontend, but none are currently used in the web code shown.
6. **Testing strategy**: Tests depend on the fixture mode (the default). No test-specific env setup was found beyond Vitest's own config.

## Rules developers should follow

- **Add new env vars in `.env.example` first**, with comments explaining what they do and how to obtain values. Do not add undocumented environment variables.
- **Always provide a sensible default** when reading `process.env` (e.g., `?? 8787`, `?? "fixture"`). Never assume an env var exists.
- **Use env vars for feature toggles** (like `ATLAS_MODE`) rather than branching on flags passed through function arguments, so behavior can be changed without code changes.
- **Keep runtime configuration out of the web app**; keep secrets and service endpoints behind the API layer.
- **New static data belongs in `data/`** and must be loaded through the typed helpers in `data.ts` to benefit from the built-in `Map` caching.
- **Do not introduce a config library** (dotenv, convict, etc.) unless there is a clear need for schema validation or multi-environment profiles — the current flat `process.env` approach is intentionally minimal.
- **Never commit real `.env` files**; only `.env.example` is tracked.