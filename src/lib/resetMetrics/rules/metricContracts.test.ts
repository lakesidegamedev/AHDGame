import { describe, expect, it } from "vitest";
import { primaryMetrics } from "../catalog";
import { metricContracts, metricCountryCoverage } from "./metricContracts";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";

describe("complete metric implementation contracts", () => {
  it("covers every catalog metric exactly once without changing current publication", () => {
    expect(metricContracts).toHaveLength(58);
    expect(new Set(metricContracts.map((c) => c.id)).size).toBe(58);
    expect(metricContracts.map((c) => c.id)).toEqual(primaryMetrics.map((m) => m.id));
    for (const contract of metricContracts) {
      const metric = primaryMetrics.find((m) => m.id === contract.id)!;
      expect(contract.owner).toBe(metric.owner);
      expect(contract.path).toBe(metric.path);
      expect(contract.current.unit).toBe(metric.unit);
      expect(Object.values(contract.target).every((field) => String(field).length > 0)).toBe(true);
      expect(contract.remainingEvidence.length).toBeGreaterThan(20);
      expect(contract.implementation).toBe("requires-owner-evidence");
    }
  });

  it("keeps event measurements distinct from every-turn evaluation", () => {
    expect(metricContracts.find((c) => c.id === "51")!.target.measurement).toBe("election");
    expect(metricContracts.find((c) => c.id === "34")!.target.measurement).toBe("cohort");
    expect(metricContracts.every((c) => c.target.evaluation === "every-turn")).toBe(true);
  });

  it("does not relabel today's gross income or poverty proxy as disposable income", () => {
    const purchasing = metricContracts.find((c) => c.id === "02")!;
    expect(purchasing.current.unit).not.toBe(purchasing.target.unit);
    expect(metricContracts.find((c) => c.id === "03")!.target.aggregation).toBe("distribution");
    expect(metricContracts.find((c) => c.id === "04")!.target.aggregation).toBe("distribution");
  });

  it("inventories every configured country without claiming worldwide model readiness", () => {
    const countries = Object.keys(COUNTRY_CONFIGS);
    const coverage = metricCountryCoverage([...countries, "US"]);
    expect(coverage.map((c) => c.countryId)).toEqual([...new Set(countries)].sort());
    expect(
      coverage.filter((c) => c.currentPath === "reviewed-v2-catalog").map((c) => c.countryId)
    ).toEqual(["IE", "JP", "SCO", "UK", "US", "WAL"]);
    expect(coverage.find((c) => c.countryId === "DE")!.currentPath).toBe("legacy");
    expect(coverage.every((c) => !c.targetModelReady)).toBe(true);
  });
});
