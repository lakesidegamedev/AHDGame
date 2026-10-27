import { describe, expect, it } from "vitest";
import { simulateReceiptTiming, type DemographicReceiptInput } from "./demographicReceiptTiming";

function fixture(): DemographicReceiptInput {
  const ages = Array.from({ length: 101 }, () => 500);
  const rates = Array.from({ length: 101 }, (_, age) => (age === 100 ? 0.55 : 0.005));
  return {
    turn: 10,
    observedMigrationPct: 0.148,
    regions: [
      {
        id: "synthetic",
        ages: { male: ages, female: [...ages] },
        mortalityRates: { male: rates, female: [...rates] },
        openingIndex: 30,
        priorIndex: 25,
        currentPressure: 1.05,
        laggedPressure: -0.52,
        tightness: 1.5,
        wageIndex: 1,
        attractiveness: {
          gdpGrowth: 2.5,
          unemployment: 5,
          medianIncome: 50000,
          costOfLiving: 100,
          labourTightness: 1.5,
          labourWageIndex: 1,
        },
      },
    ],
  };
}

describe("offline demographic receipt sensitivity", () => {
  it("reuses identical starting cohorts and migration for the paired timing comparison", () => {
    const result = simulateReceiptTiming(fixture(), 2);
    const [old, fixed, noMigration, , higherMigration] = result.scenarios;
    expect(old.startPopulation).toBe(fixed.startPopulation);
    expect(old.migrationPct).toBe(fixed.migrationPct);
    expect(fixed.annual[1]!.fertilityMin).toBeGreaterThan(old.annual[1]!.fertilityMin);
    expect(fixed.annual[1]!.population).toBeGreaterThan(old.annual[1]!.population);
    expect(higherMigration.annual[1]!.population).toBeGreaterThan(
      noMigration.annual[1]!.population
    );
    expect(
      result.scenarios.every((s) =>
        s.annual.every((r) => Number.isFinite(r.yearGrowthPct) && r.population > 0)
      )
    ).toBe(true);
  });

  it("is deterministic and does not mutate its source snapshot", () => {
    const input = fixture();
    const before = structuredClone(input);
    const first = simulateReceiptTiming(input, 1);
    expect(simulateReceiptTiming(input, 1)).toEqual(first);
    expect(input).toEqual(before);
  });

  it("rejects invalid mortality and ambiguous region identities", () => {
    const input = fixture();
    input.regions[0]!.mortalityRates.male[0] = 1.1;
    expect(() => simulateReceiptTiming(input)).toThrow("Invalid mortality rates");
    const duplicate = fixture();
    duplicate.regions.push(structuredClone(duplicate.regions[0]!));
    expect(() => simulateReceiptTiming(duplicate)).toThrow("Duplicate region");
  });
});
