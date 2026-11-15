import { beforeAll, describe, expect, it } from "vitest";
import {
  CHECKPOINT_COUNTRIES,
  loadOpeningRegions,
  type CheckpointCountry,
} from "./longRunCheckpointInputs";
import {
  CHECKPOINT_YEARS,
  projectCheckpoints,
  type CheckpointPolicy,
  type CheckpointRegion,
  type CheckpointRun,
} from "./rules/longRunCheckpoints";
import { dependencyRatio, totalPopulation } from "./cohortVector";

const opening = {} as Record<
  CheckpointCountry,
  { regions: CheckpointRegion[]; seededPopulation: Record<string, number> }
>;

function run(country: CheckpointCountry, policy?: Partial<CheckpointPolicy>): CheckpointRun {
  return projectCheckpoints({ countryId: country, regions: opening[country].regions, policy });
}

const at = (r: CheckpointRun, year: number) => r.national.find((row) => row.year === year)!;

beforeAll(async () => {
  for (const country of CHECKPOINT_COUNTRIES) opening[country] = await loadOpeningRegions(country);
}, 120_000);

describe("long-run demographic checkpoints", () => {
  it("produces the opening, 2030, 2035, 2040, 2045 and 2050 rows for all five countries", () => {
    for (const country of CHECKPOINT_COUNTRIES) {
      const r = run(country);
      expect(r.national.map((row) => row.year)).toEqual([...CHECKPOINT_YEARS]);
    }
  });

  it("is deterministic", () => {
    expect(run("UK").national).toEqual(run("UK").national);
  });

  it("keeps every figure inside a plausible band", () => {
    for (const country of CHECKPOINT_COUNTRIES) {
      for (const row of run(country).national) {
        expect(row.medianAge, `${country} ${row.year} median age`).toBeGreaterThan(30);
        expect(row.medianAge, `${country} ${row.year} median age`).toBeLessThan(60);
        expect(row.dependencyRatio, `${country} ${row.year} dependency`).toBeGreaterThan(0.35);
        expect(row.dependencyRatio, `${country} ${row.year} dependency`).toBeLessThan(1.1);
        expect(row.workforce).toBeGreaterThan(0.4 * row.population);
        expect(row.workforce).toBeLessThan(0.7 * row.population);
      }
    }
  });

  it("gives the five countries different paths under default settings", () => {
    const runs = CHECKPOINT_COUNTRIES.map((c) => run(c));
    const growth = runs.map((r) => at(r, 2050).population / at(r, 2027).population);
    expect(new Set(growth.map((g) => g.toFixed(3))).size).toBe(5);
    const medians = runs.map((r) => at(r, 2050).medianAge.toFixed(1));
    expect(new Set(medians).size).toBe(5);
    // Japan shrinks, the youngest-fertility-gap countries diverge from the US.
    expect(at(run("JP"), 2050).population).toBeLessThan(at(run("JP"), 2027).population * 0.9);
    expect(at(run("US"), 2050).population).toBeGreaterThan(at(run("US"), 2027).population);
  });

  it("does not open with a runaway tail of the very old", () => {
    for (const country of CHECKPOINT_COUNTRIES) {
      let over90 = 0;
      let total = 0;
      for (const region of opening[country].regions) {
        total += totalPopulation(region.vector);
        for (let a = 90; a <= 100; a++) over90 += region.vector.male[a]! + region.vector.female[a]!;
      }
      expect(over90 / total, country).toBeLessThan(0.025);
    }
  });

  it("year-one deaths stay near the later level instead of a start-up spike", () => {
    for (const country of CHECKPOINT_COUNTRIES) {
      const flows = run(country).flows;
      expect(flows[0]!.deaths / flows[5]!.deaths, country).toBeLessThan(1.35);
    }
  });

  describe("policy levers move the checkpoints", () => {
    it("a higher retirement age raises the workforce and lowers the dependency ratio", () => {
      for (const country of CHECKPOINT_COUNTRIES) {
        const base = run(country);
        const later = run(country, { retirementAge: 68 });
        for (const year of CHECKPOINT_YEARS) {
          expect(at(later, year).workforce, `${country} ${year} workforce`).toBeGreaterThan(
            at(base, year).workforce
          );
          expect(at(later, year).dependencyRatio, `${country} ${year} dependency`).toBeLessThan(
            at(base, year).dependencyRatio
          );
          expect(at(later, year).population).toBe(at(base, year).population);
        }
      }
    });

    it("a lower retirement age does the opposite", () => {
      for (const country of CHECKPOINT_COUNTRIES) {
        const base = at(run(country), 2040);
        const earlier = at(run(country, { retirementAge: 60 }), 2040);
        expect(earlier.workforce).toBeLessThan(base.workforce);
        expect(earlier.dependencyRatio).toBeGreaterThan(base.dependencyRatio);
      }
    });

    it("family policy moves births, population and age", () => {
      for (const country of CHECKPOINT_COUNTRIES) {
        const generous = run(country, { demographyScore: 100 });
        const stingy = run(country, { demographyScore: 0 });
        expect(at(generous, 2050).population, country).toBeGreaterThan(at(stingy, 2050).population);
        expect(at(generous, 2050).medianAge, country).toBeLessThan(at(stingy, 2050).medianAge);
        expect(at(generous, 2030).population, country).toBeGreaterThan(at(stingy, 2030).population);
      }
    });

    it("an open entry law raises inflow where the seeded net is positive, and a closed law lowers it", () => {
      let tested = 0;
      for (const country of CHECKPOINT_COUNTRIES) {
        const inflow = opening[country].regions.reduce(
          (s, r) => s + Math.max(0, r.migrationPct),
          0
        );
        const open = at(run(country, { entryLaw: "far_left" }), 2050).population;
        const closed = at(run(country, { entryLaw: "far_right" }), 2050).population;
        const base = at(run(country), 2050).population;
        if (inflow > 0) {
          tested += 1;
          expect(open, country).toBeGreaterThan(base);
          expect(closed, country).toBeLessThan(base);
        } else {
          // Entry law scales inflow only; a country with none is unmoved.
          expect(open).toBe(base);
        }
      }
      expect(tested).toBeGreaterThanOrEqual(3);
    });
  });

  describe("regional totals reconcile with national totals", () => {
    it("seeded regional populations sum to the opening national table within rounding", () => {
      for (const country of CHECKPOINT_COUNTRIES) {
        const seeded = Object.values(opening[country].seededPopulation).reduce((a, b) => a + b, 0);
        expect(at(run(country), 2027).population / seeded, country).toBeCloseTo(1, 6);
        for (const region of opening[country].regions) {
          expect(
            totalPopulation(region.vector) / opening[country].seededPopulation[region.id]!,
            `${country}:${region.id}`
          ).toBeCloseTo(1, 6);
        }
      }
    });

    it("regional rows sum to the national row at every checkpoint", () => {
      for (const country of CHECKPOINT_COUNTRIES) {
        const r = run(country);
        for (const year of CHECKPOINT_YEARS) {
          const regions = r.regional.filter((row) => row.year === year);
          expect(regions.length).toBe(opening[country].regions.length);
          const pop = regions.reduce((s, row) => s + row.population, 0);
          const work = regions.reduce((s, row) => s + row.workforce, 0);
          expect(pop / at(r, year).population, `${country} ${year}`).toBeCloseTo(1, 9);
          expect(work / at(r, year).workforce, `${country} ${year}`).toBeCloseTo(1, 9);
        }
      }
    });

    it("every year's national change equals births minus deaths plus net migration", () => {
      for (const country of CHECKPOINT_COUNTRIES) {
        const r = run(country);
        for (const step of r.flows) {
          const before = r.populationByYear[step.year - 1]!;
          const after = r.populationByYear[step.year]!;
          const change = step.births - step.deaths + step.netMigration;
          expect(
            Math.abs(after - before - change) / before,
            `${country} ${step.year}`
          ).toBeLessThan(1e-9);
        }
      }
    });
  });
});

describe("dependency ratio follows the retirement age", () => {
  it("keeps the 0..17 / 18..64 / 65+ split by default", () => {
    const v = { male: new Array(101).fill(0), female: new Array(101).fill(0) };
    v.male[10] = 20;
    v.male[40] = 100;
    v.male[64] = 10;
    v.male[65] = 30;
    expect(dependencyRatio(v)).toBeCloseTo((20 + 30) / 110, 10);
    expect(dependencyRatio(v, 18, 67)).toBeCloseTo(20 / 140, 10);
    expect(dependencyRatio(v, 18, 60)).toBeCloseTo((20 + 10 + 30) / 100, 10);
  });
});
