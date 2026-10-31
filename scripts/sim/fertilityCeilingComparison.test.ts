import { describe, expect, it } from "vitest";
import { RESET_V2_COUNTRIES } from "../../src/lib/resetVersions/rules";
import { compareFertilityCeilings } from "./fertilityCeilingComparison";

function fixture() {
  return RESET_V2_COUNTRIES.map((country) => ({
    country,
    basis: "synthetic control",
    input: {
      turn: 10,
      observedMigrationPct: 0,
      regions: [
        {
          id: country,
          ages: { male: Array<number>(101).fill(500), female: Array<number>(101).fill(500) },
          mortalityRates: {
            male: Array<number>(101).fill(0.005),
            female: Array<number>(101).fill(0.005),
          },
          openingIndex: 35,
          priorIndex: 35,
          currentPressure: 0,
          laggedPressure: 0,
          tightness: 1,
          wageIndex: 1,
          attractiveness: {
            gdpGrowth: 2.5,
            unemployment: 5,
            medianIncome: 50000,
            costOfLiving: 100,
            labourTightness: 1,
            labourWageIndex: 1,
          },
        },
      ],
    },
  }));
}

describe("all-country fertility ceiling comparison", () => {
  it("covers every supported country and keeps neutral funding unchanged", () => {
    const input = fixture();
    const before = structuredClone(input);
    const report = compareFertilityCeilings(input, 1);
    expect(report.countries.map((c) => c.country)).toEqual([...RESET_V2_COUNTRIES]);
    for (const country of report.countries) {
      expect(country.arms).toHaveLength(6);
      const neutral = country.arms.filter((a) => a.pressure === "current");
      expect(neutral[1]!.annual).toEqual(neutral[0]!.annual);
      expect(neutral[2]!.annual).toEqual(neutral[0]!.annual);
      const maximum = country.arms.filter((a) => a.pressure === "maximum");
      expect(maximum[1]!.annual[0]!.population).toBeGreaterThan(maximum[0]!.annual[0]!.population);
      expect(maximum[2]!.annual[0]!.population).toBeGreaterThan(maximum[1]!.annual[0]!.population);
    }
    expect(input).toEqual(before);
  });

  it("rejects missing countries, duplicates and mismatched source turns", () => {
    expect(() => compareFertilityCeilings(fixture().slice(1), 1)).toThrow(
      "every supported country"
    );
    const duplicate = fixture();
    duplicate[0] = duplicate[1]!;
    expect(() => compareFertilityCeilings(duplicate, 1)).toThrow("every supported country");
    const mismatch = fixture();
    mismatch[0]!.input.turn++;
    expect(() => compareFertilityCeilings(mismatch, 1)).toThrow("Source turns differ");
  });
});
