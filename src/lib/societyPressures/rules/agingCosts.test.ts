import { describe, expect, it } from "vitest";
import type { AgeSexVector } from "@/lib/demographics/cohortVector";
import { advanceCohort } from "@/lib/demographics/cohortFlows";
import {
  lifeExpectancyGain,
  mortalityImprovementFactor,
  pathTfr,
} from "@/lib/demographics/rules/demographicPaths";
import {
  applyAgingCostScale,
  computeAgingCostPressure,
  healthDemandPerCapita,
  oldAgeDependency,
} from "./agingCosts";
import { pensionAgeShiftYears } from "./laws";

/** Split a per-age head count evenly between the sexes. */
function vector(perAge: (age: number) => number): AgeSexVector {
  const male: number[] = [];
  const female: number[] = [];
  for (let age = 0; age <= 100; age++) {
    male[age] = perAge(age) / 2;
    female[age] = perAge(age) / 2;
  }
  return { male, female };
}

/** Deterministic opening pyramids for the checkpoint fixture (invented shapes). */
const FIXTURES: Record<
  "US" | "JP",
  { ages: AgeSexVector; netMigrationPerYear: number; pensionShare: number }
> = {
  US: {
    ages: vector((a) => 1e6 * (a <= 17 ? 1 : a <= 63 ? 1.05 : 1.05 * Math.exp(-0.065 * (a - 63)))),
    netMigrationPerYear: 0.003,
    pensionShare: 5,
  },
  JP: {
    ages: vector(
      (a) =>
        1e6 * (a <= 17 ? 0.6 : a <= 44 ? 0.8 : a <= 63 ? 1.05 : 1.2 * Math.exp(-0.05 * (a - 63)))
    ),
    netMigrationPerYear: 0.0005,
    pensionShare: 10,
  },
};

const WORKING_AGE = 18;
const RETIREMENT_AGE = 64;
const STEPS_PER_YEAR = 4;

/** Project a fixture on the 2027 country paths and read the pension pressure at checkpoints. */
function project(countryId: "US" | "JP", indexationOption: number | null, years: number[]) {
  const fixture = FIXTURES[countryId];
  let ages = fixture.ages;
  let previous: ReturnType<typeof computeAgingCostPressure> | undefined;
  const out = new Map<number, { dependency: number; pensionCostShare: number; health: number }>();
  for (let year = 2027; year <= Math.max(...years); year++) {
    const pressure = computeAgingCostPressure({
      ages,
      turn: year,
      workingAge: WORKING_AGE,
      retirementAge: RETIREMENT_AGE,
      pensionAgeShift: pensionAgeShiftYears(indexationOption, lifeExpectancyGain(countryId, year)),
      previous,
    });
    previous = pressure;
    if (years.includes(year))
      out.set(year, {
        dependency: pressure.oldAgeDependency,
        pensionCostShare: fixture.pensionShare * pressure.pensionScale,
        health: pressure.healthScale,
      });
    for (let step = 0; step < STEPS_PER_YEAR; step++) {
      const pop = ages.male.reduce((a, b) => a + b, 0) + ages.female.reduce((a, b) => a + b, 0);
      ages = advanceCohort(
        ages,
        {
          replacementTFR: 2.06,
          birthRateIndex: 50,
          fertilityRate: pathTfr(countryId, year),
          healthcare: {},
          mortalityImprovement: mortalityImprovementFactor(countryId, year),
          netInternationalMigrants: (pop * fixture.netMigrationPerYear) / STEPS_PER_YEAR,
          migrantShareMale: 0.5,
        },
        year * STEPS_PER_YEAR + step,
        STEPS_PER_YEAR
      ).vector;
    }
  }
  return out;
}

describe("oldAgeDependency and health demand", () => {
  const flat = vector(() => 1);

  it("counts pensioners per working-age person, with a fractional pension age", () => {
    // 18..63 work (46 years), 64..100 draw a pension (37 years).
    expect(oldAgeDependency(flat, 18, 64)).toBeCloseTo(37 / 46, 9);
    // Half a year later: half of the 64 cohort still works.
    expect(oldAgeDependency(flat, 18, 64.5)).toBeCloseTo(36.5 / 46.5, 9);
  });

  it("weights older people more heavily for health care", () => {
    const young = vector((a) => (a < 40 ? 1 : 0));
    const old = vector((a) => (a >= 70 ? 1 : 0));
    expect(healthDemandPerCapita(old)).toBeGreaterThan(2 * healthDemandPerCapita(young));
  });
});

describe("computeAgingCostPressure", () => {
  it("opens at 1 and keeps its baseline as the population ages", () => {
    const opening = computeAgingCostPressure({
      ages: FIXTURES.US.ages,
      turn: 1,
      workingAge: 18,
      retirementAge: 64,
      pensionAgeShift: 0,
    });
    expect(opening.pensionScale).toBeCloseTo(1, 9);
    expect(opening.healthScale).toBeCloseTo(1, 9);
    const older = computeAgingCostPressure({
      ages: FIXTURES.JP.ages,
      turn: 2,
      workingAge: 18,
      retirementAge: 64,
      pensionAgeShift: 0,
      previous: opening,
    });
    expect(older.baselineOldAgeDependency).toBe(opening.baselineOldAgeDependency);
    expect(older.pensionScale).toBeGreaterThan(1);
    expect(older.healthScale).toBeGreaterThan(1);
  });

  it("lowers the pension bill when the pension age rises", () => {
    const base = { ages: FIXTURES.JP.ages, turn: 1, workingAge: 18, retirementAge: 64 };
    const fixed = computeAgingCostPressure({ ...base, pensionAgeShift: 0 });
    const indexed = computeAgingCostPressure({ ...base, pensionAgeShift: 2, previous: fixed });
    expect(indexed.pensionScale).toBeLessThan(fixed.pensionScale);
    expect(indexed.pensionAge).toBe(66);
  });
});

describe("pensionAgeShiftYears", () => {
  it("follows the indexation ladder", () => {
    expect(pensionAgeShiftYears(null, 3)).toBe(0);
    expect(pensionAgeShiftYears(3, 3)).toBe(0);
    expect(pensionAgeShiftYears(0, 3)).toBe(-2);
    expect(pensionAgeShiftYears(4, 3)).toBe(1.5);
    expect(pensionAgeShiftYears(5, 3)).toBe(3);
    expect(pensionAgeShiftYears(6, 3)).toBe(4);
  });
});

describe("applyAgingCostScale", () => {
  it("scales pension and health lines and leaves the rest", () => {
    const out = applyAgingCostScale(
      { socialSecurity: 100, welfare: 100, healthcare: 100, defense: 100 },
      { pensionScale: 1.4, healthScale: 1.2 }
    );
    expect(out.socialSecurity).toBeCloseTo(140, 9);
    expect(out.welfare).toBeCloseTo(120, 9);
    expect(out.healthcare).toBeCloseTo(120, 9);
    expect(out.defense).toBe(100);
  });

  it("is a no-op without pressure", () => {
    const table = { socialSecurity: 100 };
    expect(applyAgingCostScale(table, undefined)).toBe(table);
  });
});

describe("2027 to 2050 checkpoints (deterministic fixture)", () => {
  const years = [2027, 2035, 2050];
  const rows = (["US", "JP"] as const).flatMap((countryId) => {
    const fixed = project(countryId, null, years);
    const indexed = project(countryId, 5, years);
    return years.map((year) => ({
      country: countryId,
      year,
      dependencyRatio: Number(fixed.get(year)!.dependency.toFixed(3)),
      pensionCostSharePct: Number(fixed.get(year)!.pensionCostShare.toFixed(2)),
      indexedPensionCostSharePct: Number(indexed.get(year)!.pensionCostShare.toFixed(2)),
      healthScale: Number(fixed.get(year)!.health.toFixed(3)),
    }));
  });
  console.table(rows);
  const row = (country: string, year: number) =>
    rows.find((r) => r.country === country && r.year === year)!;

  it("ages both countries, Japan from a higher level", () => {
    for (const country of ["US", "JP"]) {
      expect(row(country, 2035).dependencyRatio).toBeGreaterThan(
        row(country, 2027).dependencyRatio
      );
      expect(row(country, 2050).pensionCostSharePct).toBeGreaterThan(
        row(country, 2027).pensionCostSharePct
      );
    }
    for (const year of years)
      expect(row("JP", year).dependencyRatio).toBeGreaterThan(row("US", year).dependencyRatio);
  });

  it("pension age indexation cuts the 2050 pension bill", () => {
    for (const country of ["US", "JP"]) {
      expect(row(country, 2027).indexedPensionCostSharePct).toBeCloseTo(
        row(country, 2027).pensionCostSharePct,
        6
      );
      expect(row(country, 2050).indexedPensionCostSharePct).toBeLessThan(
        row(country, 2050).pensionCostSharePct
      );
    }
  });
});
