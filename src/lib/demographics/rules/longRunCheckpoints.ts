/**
 * Long-run demographic checkpoints for the 2027 world. Advances each region's
 * age and sex vector one game year at a time through the same flow rules the
 * turn uses (aging, mortality on the country path, fertility on the country
 * path, international migration) and reports national figures at fixed years.
 *
 * Pure: regions come in as plain data, nothing is read or written. The table
 * is an offline reading of the rules, not a forecast.
 */
import { advanceCohort, type CohortFlowTallies } from "../cohortFlows";
import {
  dependencyRatio,
  medianAgeFromVector,
  totalPopulation,
  workingAgePopulation,
  type AgeSexVector,
} from "../cohortVector";
import {
  capNetMigrants,
  entryAccessMigrationPct,
  type MigrationLawPosition,
} from "../flows/internationalMigration";
import { mortalityImprovementFactor, PATH_START_YEAR, regionPathTfr } from "./demographicPaths";
import { DEFAULT_RETIREMENT_AGE, DEFAULT_WORKING_AGE } from "@/lib/constants/laborAge";

export const CHECKPOINT_YEARS = [2027, 2030, 2035, 2040, 2045, 2050] as const;

export interface CheckpointRegion {
  id: string;
  vector: AgeSexVector;
  /** Seeded birthRate index (0-100), the regional fertility character. */
  birthRateIndex: number;
  /** Seeded annual net migration, % of population, before any law. */
  migrationPct: number;
}

export interface CheckpointPolicy {
  /** Demography policy score 0-100, neutral 50, or null for none. */
  demographyScore: number | null;
  workingAge: number;
  retirementAge: number;
  /** Entry and residence law position; null is the unmodified centre. */
  entryLaw: MigrationLawPosition | null;
}

export const DEFAULT_CHECKPOINT_POLICY: CheckpointPolicy = {
  demographyScore: 50,
  workingAge: DEFAULT_WORKING_AGE,
  retirementAge: DEFAULT_RETIREMENT_AGE,
  entryLaw: null,
};

export interface CheckpointRow {
  year: number;
  population: number;
  medianAge: number;
  dependencyRatio: number;
  workforce: number;
}

export interface RegionCheckpointRow extends CheckpointRow {
  regionId: string;
}

export interface StepFlows extends CohortFlowTallies {
  year: number;
}

export interface CheckpointRun {
  countryId: string;
  national: CheckpointRow[];
  regional: RegionCheckpointRow[];
  /** Whole-country flows per simulated year, for stock-flow checks. */
  flows: StepFlows[];
  /** Whole-country population at every simulated year, keyed by year. */
  populationByYear: Record<number, number>;
}

function addVectors(into: AgeSexVector, v: AgeSexVector): void {
  for (let a = 0; a <= 100; a++) {
    into.male[a] = (into.male[a] ?? 0) + (v.male[a] ?? 0);
    into.female[a] = (into.female[a] ?? 0) + (v.female[a] ?? 0);
  }
}

function emptyVector(): AgeSexVector {
  return { male: new Array<number>(101).fill(0), female: new Array<number>(101).fill(0) };
}

function row(year: number, v: AgeSexVector, policy: CheckpointPolicy): CheckpointRow {
  return {
    year,
    population: totalPopulation(v),
    medianAge: medianAgeFromVector(v),
    dependencyRatio: dependencyRatio(v, policy.workingAge, policy.retirementAge),
    workforce: workingAgePopulation(v, policy.workingAge, policy.retirementAge),
  };
}

export function projectCheckpoints(input: {
  countryId: string;
  regions: readonly CheckpointRegion[];
  policy?: Partial<CheckpointPolicy>;
  years?: readonly number[];
}): CheckpointRun {
  const policy: CheckpointPolicy = { ...DEFAULT_CHECKPOINT_POLICY, ...input.policy };
  const years = input.years ?? CHECKPOINT_YEARS;
  const lastYear = Math.max(...years);
  const wanted = new Set(years);
  const popTotal = input.regions.reduce((s, r) => s + totalPopulation(r.vector), 0);
  const meanIndex =
    popTotal > 0
      ? input.regions.reduce((s, r) => s + r.birthRateIndex * totalPopulation(r.vector), 0) /
        popTotal
      : 50;

  let vectors = input.regions.map((r) => r.vector);
  const national: CheckpointRow[] = [];
  const regional: RegionCheckpointRow[] = [];
  const flows: StepFlows[] = [];
  const populationByYear: Record<number, number> = {};

  const record = (year: number): void => {
    const sum = emptyVector();
    for (const v of vectors) addVectors(sum, v);
    populationByYear[year] = totalPopulation(sum);
    if (!wanted.has(year)) return;
    national.push(row(year, sum, policy));
    input.regions.forEach((r, i) =>
      regional.push({ regionId: r.id, ...row(year, vectors[i]!, policy) })
    );
  };

  record(PATH_START_YEAR);
  for (let year = PATH_START_YEAR; year < lastYear; year++) {
    const improvement = mortalityImprovementFactor(input.countryId, year);
    const step: StepFlows = { year: year + 1, births: 0, deaths: 0, netMigration: 0 };
    vectors = vectors.map((vector, i) => {
      const region = input.regions[i]!;
      const pop = totalPopulation(vector);
      const lawPct = entryAccessMigrationPct(region.migrationPct, policy.entryLaw);
      const net = capNetMigrants(((lawPct / 100) * pop) / 1, pop, 1);
      const out = advanceCohort(
        vector,
        {
          replacementTFR: 2.1,
          birthRateIndex: region.birthRateIndex,
          fertilityRate: regionPathTfr({
            countryId: input.countryId,
            year,
            demographyScore: policy.demographyScore,
            regionIndex: region.birthRateIndex,
            countryMeanIndex: meanIndex,
          }),
          healthcare: {},
          mortalityImprovement: improvement,
          netInternationalMigrants: net,
          migrantShareMale: 0.5,
        },
        0,
        1
      );
      step.births += out.flows.births;
      step.deaths += out.flows.deaths;
      step.netMigration += out.flows.netMigration;
      return out.vector;
    });
    flows.push(step);
    record(year + 1);
  }
  return { countryId: input.countryId, national, regional, flows, populationByYear };
}

export function renderCheckpointTable(run: CheckpointRun): string {
  const lines = [
    `| ${run.countryId} year | population (m) | median age | dependency ratio | workforce (m) |`,
    "|---|---:|---:|---:|---:|",
  ];
  for (const r of run.national) {
    lines.push(
      `| ${r.year === PATH_START_YEAR ? "opening" : r.year} | ${(r.population / 1e6).toFixed(1)} | ${r.medianAge.toFixed(1)} | ${r.dependencyRatio.toFixed(3)} | ${(r.workforce / 1e6).toFixed(1)} |`
    );
  }
  return lines.join("\n");
}
