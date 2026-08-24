import { createAtlasClient } from "../atlas/index.js";
import { REPO_ROOT } from "../data.js";
import { runNightly } from "../agents/fare_board.js";

// Nightly fare-board batch (FR-017). Locally: `npm run fareboard`.
// In Qoder this runs as a Scheduled Task (see infra/scheduled-tasks/) with the
// Atlas Skill available, which makes the pipeline auditable Qoder work.
const client = createAtlasClient(REPO_ROOT);
const { entries, weekend } = await runNightly(client);
console.log(
  weekend
    ? `fare board: ${entries.length} snapshots for ${weekend.holiday} (${weekend.start}..${weekend.end}) [${client.mode}]`
    : "fare board: no upcoming long weekend in the holiday file",
);
