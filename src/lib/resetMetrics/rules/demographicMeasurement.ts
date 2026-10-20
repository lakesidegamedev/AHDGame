/**
 * Fertility and life expectancy use age-specific flows, not regional averages.
 * demographicRates pools births and mortality exposures before recomputing a
 * synthetic lifetime. Calibrated mortality also drives the actual cohort flow.
 */
import type { AgeSexVector } from "@/lib/demographics/cohortVector";
import { asfrWeight } from "@/lib/demographics/flows/fertility";
import { perAgeMortality } from "@/lib/demographics/flows/mortality";
import { sexRatioAtAge } from "@/lib/demographics/sexRatioCurve";

export interface FertilityBasis {
  kind: "fertility";
  /** Annual births by maternal age 15 through 49; the current flow models births only at 18-44. */
  births: number[];
  women: number[];
}

export interface MortalityBasis {
  kind: "mortality";
  /** Annualized expected deaths and exposed residents by sex and age 0 through 100+. */
  maleDeaths: number[];
  femaleDeaths: number[];
  maleExposure: number[];
  femaleExposure: number[];
}

export type DemographicBasis = FertilityBasis | MortalityBasis;
export type MortalityRates = { male: number[]; female: number[] };

function validCells(values: readonly number[], size: number): boolean {
  return values.length === size && values.every((v) => Number.isFinite(v) && v >= 0);
}

export function validDemographicBasis(basis: DemographicBasis): boolean {
  if (basis.kind === "fertility")
    return (
      validCells(basis.births, 35) &&
      validCells(basis.women, 35) &&
      basis.births.every((births, i) => basis.women[i]! > 0 || births === 0)
    );
  return (
    [basis.maleDeaths, basis.femaleDeaths, basis.maleExposure, basis.femaleExposure].every((v) =>
      validCells(v, 101)
    ) &&
    basis.maleDeaths.every((d, i) => d <= basis.maleExposure[i]!) &&
    basis.femaleDeaths.every((d, i) => d <= basis.femaleExposure[i]!)
  );
}

/** Zero-exposure ages are unavailable, not silently assumed to have zero mortality/fertility. */
export function demographicRates(bases: readonly DemographicBasis[]): number | null {
  const first = bases[0];
  if (!first || bases.some((b) => b.kind !== first.kind || !validDemographicBasis(b))) return null;
  if (first.kind === "fertility") {
    const rows = bases as readonly FertilityBasis[];
    let tfr = 0;
    for (let i = 0; i < 35; i++) {
      const women = rows.reduce((n, b) => n + b.women[i]!, 0);
      if (women <= 0) return null;
      tfr += rows.reduce((n, b) => n + b.births[i]!, 0) / women;
    }
    return tfr;
  }
  const rows = bases as readonly MortalityBasis[];
  const rates: MortalityRates = { male: [], female: [] };
  for (const sex of ["male", "female"] as const) {
    for (let age = 0; age <= 100; age++) {
      const exposure = rows.reduce((n, b) => n + b[`${sex}Exposure`][age]!, 0);
      if (exposure <= 0) return null;
      rates[sex].push(rows.reduce((n, b) => n + b[`${sex}Deaths`][age]!, 0) / exposure);
    }
  }
  return lifeFromMortalityRates(rates);
}

/** Complete life table: central death rates become q=m/(1+m/2); the open 100+ tail uses 1/m. */
export function lifeFromMortalityRates(rates: MortalityRates): number | null {
  if (![rates.male, rates.female].every((v) => validCells(v, 101) && v.every((q) => q <= 1)))
    return null;
  let combined = 0;
  const maleBirthShare = sexRatioAtAge(0);
  for (const sex of ["male", "female"] as const) {
    if (rates[sex][100]! <= 0) return null;
    let survivors = 1,
      years = 0;
    for (let age = 0; age < 100; age++) {
      const m = rates[sex][age]!;
      const q = m / (1 + m / 2);
      years += survivors * (1 - q / 2);
      survivors *= 1 - q;
    }
    combined +=
      (years + survivors / rates[sex][100]!) *
      (sex === "male" ? maleBirthShare : 1 - maleBirthShare);
  }
  return combined;
}

function scaledMortality(scale: number): MortalityRates {
  return Object.fromEntries(
    (["male", "female"] as const).map((sex) => [
      sex,
      Array.from({ length: 101 }, (_, age) => Math.min(1, perAgeMortality(sex, age) * scale)),
    ])
  ) as MortalityRates;
}

/** Solve the historic regional anchor on the central-rate curve itself, never add display years. */
export function calibratedMortalityRates(input: {
  openingYears: number;
  openingPreventable: number;
  currentPreventable: number;
}): MortalityRates {
  if (
    ![input.openingYears, input.openingPreventable, input.currentPreventable].every(
      Number.isFinite
    ) ||
    input.openingYears <= 1 ||
    input.openingYears >= 120 ||
    input.openingPreventable <= 0 ||
    input.currentPreventable < 0
  )
    throw new Error("Invalid mortality calibration");
  let lo = 0.001,
    hi = 100;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (lifeFromMortalityRates(scaledMortality(mid))! > input.openingYears) lo = mid;
    else hi = mid;
  }
  // Keep the established bounded healthcare response; no self-feedback from displayed life expectancy.
  const response = Math.max(
    0.7,
    Math.min(1.4, 1 + ((input.currentPreventable - input.openingPreventable) * 0.3) / 190)
  );
  return scaledMortality(((lo + hi) / 2) * response);
}

export function fertilityBasis(
  exposure: AgeSexVector,
  tfr: number,
  servingFemaleByAge?: readonly number[]
): FertilityBasis {
  return {
    kind: "fertility",
    women: exposure.female.slice(15, 50),
    births: Array.from({ length: 35 }, (_, i) => {
      const age = i + 15;
      return (
        Math.max(0, exposure.female[age]! - (servingFemaleByAge?.[age] ?? 0)) *
        tfr *
        asfrWeight(age)
      );
    }),
  };
}
