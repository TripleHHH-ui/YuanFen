import path from "node:path";
import { CliAtlasClient } from "./cli.js";
import { FixtureAtlasClient } from "./fixture.js";
import type { AtlasClient } from "./types.js";

export * from "./types.js";
export { FixtureAtlasClient } from "./fixture.js";
export { CliAtlasClient } from "./cli.js";

export function createAtlasClient(repoRoot: string): AtlasClient {
  if (process.env.ATLAS_MODE === "cli") return new CliAtlasClient();
  return new FixtureAtlasClient(path.join(repoRoot, "data", "fares", "fixtures", "searches.json"));
}
