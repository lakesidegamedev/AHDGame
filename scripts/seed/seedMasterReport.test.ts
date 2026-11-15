import { describe, expect, it } from "vitest";
import { SEED_MANIFEST } from "../../src/lib/admin/seed/seedManifest";
import { SEED_PRESET_IDS } from "../../src/lib/constants/turnTime";
import { buildMasterReport, contractMismatches, renderMasterReport } from "./seedMasterReport";

describe("seed master report", () => {
  const report = buildMasterReport();

  it("classifies every collection, field and dataset", () => {
    expect(report.unclassified).toEqual([]);
  });

  it("lists every manifest collection with a reset action", () => {
    expect(report.collections.map((row) => row.name).sort()).toEqual(
      SEED_MANIFEST.map((entry) => entry.name).sort()
    );
    for (const row of report.collections) {
      expect(row.action, row.name).not.toBe("UNCLASSIFIED");
      expect(row.reason.length, row.name).toBeGreaterThan(0);
    }
  });

  it("lists a status for every dataset in every preset", () => {
    for (const row of report.datasets.filter((entry) => entry.kind === "per-preset")) {
      for (const preset of SEED_PRESET_IDS) expect(row.status[preset], row.id).toBeDefined();
    }
  });

  it("renders every preset and the unclassified count", () => {
    const text = renderMasterReport(report);
    expect(text).toContain("Unclassified entries: 0");
    for (const preset of SEED_PRESET_IDS) expect(text).toContain(preset);
  });

  it("reports a field with no action, and a stale one, as unclassified", () => {
    expect(contractMismatches(["a", "b"], ["a"])).toEqual(["b: no action"]);
    expect(contractMismatches(["a"], ["a", "gone"])).toEqual(["gone: no longer declared"]);
    expect(contractMismatches(["a"], ["a"])).toEqual([]);
  });
});
