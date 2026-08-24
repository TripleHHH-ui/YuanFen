import { describe, expect, it } from "vitest";
import { longWeekends, type Holiday } from "../src/index.js";

const HOLIDAYS: Holiday[] = [
  { name: "National Day", date: "2026-08-09", observed: "2026-08-10" },
  { name: "Deepavali", date: "2026-11-08", observed: "2026-11-09" },
  { name: "Christmas Day", date: "2026-12-25" },
  { name: "Hari Raya Haji", date: "2027-05-17" },
];

describe("longWeekends (FR-008)", () => {
  it("finds the Deepavali long weekend Sat 07 - Mon 09 Nov 2026 from 2026-08-24", () => {
    const found = lw("2026-08-24");
    const deepavali = found.find((w) => w.holiday === "Deepavali");
    expect(deepavali).toBeDefined();
    expect(deepavali!.start).toBe("2026-11-07");
    expect(deepavali!.end).toBe("2026-11-09");
    expect(deepavali!.nights).toBe(2);
  });

  it("ignores holidays already past", () => {
    const found = lw("2026-08-24");
    expect(found.find((w) => w.holiday === "National Day")).toBeUndefined();
  });

  it("detects a Friday holiday as Fri-Sun window", () => {
    const found = lw("2026-11-20");
    const xmas = found.find((w) => w.holiday === "Christmas Day");
    expect(xmas).toBeDefined();
    expect(xmas!.start).toBe("2026-12-25");
    expect(xmas!.end).toBe("2026-12-27");
  });

  it("detects a Monday holiday as Sat-Mon window", () => {
    const found = lw("2027-04-01");
    const hrh = found.find((w) => w.holiday === "Hari Raya Haji");
    expect(hrh).toBeDefined();
    expect(hrh!.start).toBe("2027-05-15");
    expect(hrh!.end).toBe("2027-05-17");
  });

  it("skips midweek holidays with no adjacent weekend", () => {
    const midweek: Holiday[] = [{ name: "Vesak Day", date: "2027-05-20" }]; // Thursday
    expect(longWeekends(midweek, "2027-01-01")).toEqual([]);
  });

  function lw(from: string) {
    return longWeekends(HOLIDAYS, from);
  }
});
