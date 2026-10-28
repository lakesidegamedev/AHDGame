import { describe, expect, it } from "vitest";
import { runElectorateCoverage2000 } from "./electorateCoverage2000";

describe("year-2000 electorate coverage qualification", () => {
  it("covers all 71 regions with finite normalized electorates and no missing eligible groups", () => {
    const report = runElectorateCoverage2000();
    expect(report.rows).toHaveLength(71);
    for (const row of report.rows) {
      expect(row.missing, `${row.countryId}/${row.regionId}`).toEqual([]);
      expect(row.mass).toBeCloseTo(1, 10);
      expect([row.economicLean, row.socialLean, row.turnout].every(Number.isFinite)).toBe(true);
      for (const section of row.sections)
        expect(section.buckets.reduce((sum, b) => sum + b.share, 0)).toBeCloseTo(100, 8);
    }
  });
});
