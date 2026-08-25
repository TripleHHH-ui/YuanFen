/**
 * FR-018: in-memory ring log of every Atlas-client call. Passenger details
 * NEVER enter this log (L2 rule: zero logging of passenger data) — records
 * carry operation metadata only.
 */
export interface EvidenceRecord {
  request_id: string;
  ts: string;
  op: string;
  env: string;
  mode: "fixture" | "cli";
  summary: string;
}

const MAX_RECORDS = 200;
const records: EvidenceRecord[] = [];

export function recordEvidence(entry: EvidenceRecord): void {
  records.push(entry);
  if (records.length > MAX_RECORDS) records.shift();
}

export function evidenceLog(): EvidenceRecord[] {
  return [...records].reverse();
}

export function clearEvidence(): void {
  records.length = 0;
}
