import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  longWeekends,
  rankHand,
  totalWithBag,
  type FareSnapshotEntry,
  type HandResult,
  type LongWeekend,
  type TasteVector,
} from "@yuanfen/shared";
import { loadDestinations, loadHolidays, REPO_ROOT } from "../data.js";
import type { AtlasClient } from "../atlas/types.js";

/**
 * FareBoardAgent (FR-008/FR-009/FR-017): nightly batch over the fixed
 * candidate set — one origin, 8 destinations, next long-weekend window.
 * Backs off on retryable responses. The per-user path (getAlert) is pure
 * ranking over stored snapshots — no live Atlas call belongs there.
 */
const SNAPSHOT_DIR = path.join(REPO_ROOT, "data", "fares", "snapshots");
const BACKOFF_MS = [1000, 2000, 4000];

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nextLongWeekend(from: string): LongWeekend | null {
  return longWeekends(loadHolidays(), from)[0] ?? null;
}

/** Fly-out date: the evening before the window opens. */
export function departDateFor(weekend: LongWeekend): string {
  return addDaysIso(weekend.start, -1);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runNightly(
  client: AtlasClient,
  opts: { from?: string; outDir?: string; persist?: boolean } = {},
): Promise<{ entries: FareSnapshotEntry[]; weekend: LongWeekend | null }> {
  const from = opts.from ?? new Date().toISOString().slice(0, 10);
  const weekend = nextLongWeekend(from);
  if (!weekend) return { entries: [], weekend: null };
  const depart = departDateFor(weekend);
  const { origin, profiles } = loadDestinations();

  const entries: FareSnapshotEntry[] = [];
  for (const destination of Object.keys(profiles)) {
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      const env = await client.search({ origin, destination, depart, adults: 1 });
      if (env.status === "ok" && env.data) {
        const cheapest = [...env.data.offers].sort((a, b) => totalWithBag(a) - totalWithBag(b))[0];
        if (cheapest) {
          entries.push({
            origin,
            destination,
            depart,
            offer: cheapest,
            fetchedAt: new Date().toISOString(),
            request_id: env.request_id,
            mode: client.mode,
          });
        }
        break;
      }
      if (!env.retryable || attempt === BACKOFF_MS.length) break;
      await sleep(BACKOFF_MS[attempt]!);
    }
  }

  if (opts.persist !== false) {
    const dir = opts.outDir ?? SNAPSHOT_DIR;
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify({ weekend, entries }, null, 2));
  }
  return { entries, weekend };
}

export function loadSnapshots(dir = SNAPSHOT_DIR): FareSnapshotEntry[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")).entries as FareSnapshotEntry[]);
  } catch {
    return [];
  }
}

let memoryEntries: FareSnapshotEntry[] | null = null;
let memoryWeekend: LongWeekend | null = null;

export async function getAlert(
  taste: TasteVector,
  client: AtlasClient,
): Promise<{ weekend: LongWeekend | null; hand: HandResult | null; mode: string }> {
  // Per-user path: rank stored snapshots. If no nightly run has happened yet
  // (fresh clone), do one in-memory fixture pass so the demo always has a board.
  let entries = loadSnapshots();
  let weekend = nextLongWeekend(new Date().toISOString().slice(0, 10));
  if (entries.length === 0) {
    if (!memoryEntries) {
      const run = await runNightly(client, { persist: false });
      memoryEntries = run.entries;
      memoryWeekend = run.weekend;
    }
    entries = memoryEntries;
    weekend = memoryWeekend;
  }
  if (entries.length < 4) return { weekend, hand: null, mode: client.mode };
  const { profiles } = loadDestinations();
  return { weekend, hand: rankHand(entries, taste, profiles), mode: client.mode };
}
