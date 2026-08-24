# Qoder Scheduled Task — nightly fare board

Create inside a Qoder Quest with `/schedule` (docs.qoder.com → Quest → Scheduled Tasks).
The IDE must be running at fire time — enable "Keep system awake" on the demo machine.

| Field | Value |
|---|---|
| Task name | `fare-board-nightly` |
| Time | daily 02:00 SGT |
| Model | cheap tier (this is retrieval/storage, not reasoning — FareBoardAgent policy) |
| Goal mode | off |

## Task instructions (paste as-is)

```
Run the nightly fare board batch for the trip-graph-agent repo:

1. From the repo root run: npm run fareboard
   (ATLAS_MODE=cli once Atlas Sandbox authorization is done on this machine;
    it falls back to fixture envelopes otherwise and labels them.)
2. Confirm a new file appeared in data/fares/snapshots/ named <today>.json and
   that it contains one entry per candidate destination (8: DAD DPS CNX KCH KUL PEN BKK HKT).
3. If any search returned a retryable rate-limit code, the job already backed off —
   do NOT re-run it manually; note the code in the run summary instead.
4. Commit ONLY the new snapshot file with message "chore: fare snapshot <date>".

Constraints: never call atlas-flight commands other than `search` in this task;
never log passenger data (there is none in this path); keep the candidate set
exactly as defined in data/places/destinations.json.
```

Why this exists: FR-017, and the Qoder-evidence checklist — the data pipeline itself
becomes visible, auditable Qoder work instead of an invisible cron job. Screenshot the
task config and one run log for the submission.
