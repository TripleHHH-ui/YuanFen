import type { Holiday, LongWeekend } from "./types.js";

// All date math is wall-clock (UTC-anchored) — no host-timezone dependence.
function d(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const date = d(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

function weekday(isoDate: string): number {
  return d(isoDate).getUTCDay(); // 0=Sun .. 6=Sat
}

/**
 * FR-008: derive long-weekend windows from the official holiday file.
 * A long weekend is a holiday (or its observed day) that lands on or adjacent
 * to a weekend: Fri holiday -> Fri..Sun, Mon (or Sun-observed-Mon) -> Sat..Mon,
 * Sat -> Sat..Sun(+observed), Sun -> Sat..observed-or-Sun.
 */
export function longWeekends(holidays: Holiday[], from: string): LongWeekend[] {
  const out: LongWeekend[] = [];
  for (const h of holidays) {
    const effective = h.observed ?? h.date;
    if (effective <= from) continue;
    const day = weekday(effective);
    let start: string | null = null;
    let end: string | null = null;
    if (day === 5) {
      start = effective;
      end = addDays(effective, 2);
    } else if (day === 1) {
      start = addDays(effective, -2);
      end = effective;
    } else if (day === 6) {
      start = effective;
      end = addDays(effective, 1);
    } else if (day === 0) {
      start = addDays(effective, -1);
      end = effective;
    }
    if (start && end) {
      const nights = Math.round((d(end).getTime() - d(start).getTime()) / 86_400_000);
      out.push({ holiday: h.name, start, end, nights });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
