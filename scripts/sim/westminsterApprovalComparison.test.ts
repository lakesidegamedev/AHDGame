import { describe, expect, it } from "vitest";
import { simulateWestminsterApproval } from "./westminsterApprovalComparison";

describe("Westminster approval balance sensitivity", () => {
  it("checks all regions, both governments' stances and approval bands over ten years", () => {
    const report = simulateWestminsterApproval();
    expect(report.cases).toHaveLength(243);
    expect(new Set(report.cases.map((c) => c.region))).toEqual(new Set(["SCO", "WAL", "NIR"]));
    for (const row of report.cases) {
      expect(row.after.after48).toBeGreaterThanOrEqual(0);
      expect(row.after.after480).toBeLessThanOrEqual(100);
      if (row.nationalApproval === 50 || row.westminsterPolicy === "anti")
        expect(row.after).toEqual(row.before);
      if (row.nationalApproval < 50) expect(row.approvalDriver).toBeGreaterThan(0);
      if (row.nationalApproval > 50) expect(row.approvalDriver).toBeLessThan(0);
    }
    const example = report.cases.find(
      (c) =>
        c.region === "WAL" &&
        c.policy === "independence" &&
        c.westminsterPolicy === "independence" &&
        c.nationalApproval === 29.2
    )!;
    expect(example.firstDelta).toBe(0.0806);
    expect(example.before.after48).toBe(38.002);
    expect(example.after.after48).toBe(39.9988);
  });
});
