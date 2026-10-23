import type { AgeSexVector } from "./cohortVector";
import {
  applyMortality,
  healthcareMortalityModifier,
  type HealthcareInputs,
} from "./flows/mortality";
import { birthRateIndexToTFR, computeBirths, splitNewbornsBySex } from "./flows/fertility";
import { applyContinuousAging } from "./flows/aging";
import { applyInternationalMigration, migrantAgeSexProfile } from "./flows/internationalMigration";
import {
  fertilityBasis,
  type FertilityBasis,
  type MortalityBasis,
  type MortalityRates,
} from "@/lib/resetMetrics/rules/demographicMeasurement";

export interface CohortInputs {
  /** Preset-specific replacement TFR anchoring the index→TFR map (audit). */
  replacementTFR: number;
  /** `population.birthRate` metric, 0-100 index. */
  birthRateIndex: number;
  healthcare: HealthcareInputs;
  /** V2 calibrated annual age-specific central death rates; legacy worlds keep their curve. */
  mortalityRates?: MortalityRates;
  /** Bounded annual excess death fraction from an active pandemic. */
  excessMortalityAnnual?: number;
  /** National international NET migrants allocated to THIS region this turn (may be <0). */
  netInternationalMigrants: number;
  /** Sex skew of the migrant corridor (0.5 balanced). */
  migrantShareMale: number;
  /**
   * Per-age (0..100) women in mandatory military service — excluded from the
   * childbearing pool in the fertility flow (conscription, §4.5.3). Optional;
   * absent = no conscription effect.
   */
  servingFemaleByAge?: number[];
}

export interface CohortFlowTallies {
  births: number;
  deaths: number;
  netMigration: number;
}

/**
 * Advance one region's age×sex vector by one turn (design §4.2). Order:
 * continuous aging (EVERY turn — 1/turnsPerYear of each cohort graduates up,
 * smoothing the age structure) → mortality → fertility (newborns into age 0) →
 * international migration. All flows per-cell non-negative; international net may
 * change the headcount. `turn` is retained for signature stability / future use
 * (continuous aging no longer gates on it). No cross-region coupling (internal
 * migration is P1b-2).
 */
export function advanceCohort(
  vector: AgeSexVector,
  inputs: CohortInputs,
  turn: number,
  turnsPerYear: number
): {
  vector: AgeSexVector;
  flows: CohortFlowTallies;
  fertility: FertilityBasis;
  mortality: MortalityBasis;
} {
  void turn; // continuous aging is applied every turn; no boundary gate
  // Aging first (graduates the existing stock; fertility refills age 0 below).
  let v = applyContinuousAging(vector, turnsPerYear);

  // Mortality.
  const modifier = healthcareMortalityModifier(inputs.healthcare);
  const mortality: MortalityBasis = {
    kind: "mortality",
    maleExposure: [...v.male],
    femaleExposure: [...v.female],
    maleDeaths: [],
    femaleDeaths: [],
  };
  const mort = inputs.mortalityRates
    ? (() => {
        const survivors: AgeSexVector = { male: [], female: [] };
        let deaths = 0;
        for (const sex of ["male", "female"] as const)
          for (let age = 0; age <= 100; age++) {
            const q = inputs.mortalityRates![sex][age]!;
            if (!Number.isFinite(q) || q < 0 || q > 1)
              throw new Error("Invalid cohort mortality rate");
            const died = (v[sex][age]! * q) / turnsPerYear;
            survivors[sex][age] = v[sex][age]! - died;
            deaths += died;
          }
        return { survivors, deaths };
      })()
    : applyMortality(v, modifier, turnsPerYear);
  v = mort.survivors;
  const excessRate = Math.max(0, Math.min(0.012, inputs.excessMortalityAnnual ?? 0)) / turnsPerYear;
  let excessDeaths = 0;
  for (const sex of ["male", "female"] as const) {
    for (let age = 0; age <= 100; age++) {
      const deaths = inputs.mortalityRates
        ? mortality[`${sex}Exposure`][age]! * (1 - inputs.mortalityRates[sex][age]!) * excessRate
        : (v[sex][age] ?? 0) * excessRate;
      v[sex][age] = (v[sex][age] ?? 0) - deaths;
      excessDeaths += deaths;
      mortality[`${sex}Deaths`][age] = Math.max(
        0,
        Math.min(
          mortality[`${sex}Exposure`][age]!,
          (mortality[`${sex}Exposure`][age]! - v[sex][age]!) * turnsPerYear
        )
      );
    }
  }

  // Fertility → newborns into age 0 (split by sex at birth).
  const tfr = birthRateIndexToTFR(inputs.birthRateIndex, inputs.replacementTFR);
  const births = computeBirths(v, tfr, turnsPerYear, inputs.servingFemaleByAge);
  const fertility = fertilityBasis(v, tfr, inputs.servingFemaleByAge);
  const { male, female } = splitNewbornsBySex(births);
  v = { male: v.male.slice(), female: v.female.slice() };
  v.male[0] = (v.male[0] ?? 0) + male;
  v.female[0] = (v.female[0] ?? 0) + female;

  // International migration.
  const profile = migrantAgeSexProfile(inputs.migrantShareMale);
  const mig = applyInternationalMigration(v, inputs.netInternationalMigrants, profile);
  v = mig.vector;

  return {
    vector: v,
    flows: { births, deaths: mort.deaths + excessDeaths, netMigration: mig.applied },
    fertility,
    mortality,
  };
}
