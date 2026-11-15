/**
 * Regional residents in 2027 worlds. Existing regional shares are allocated
 * to the national budget's population total; see modernRegionalPopulation2027.
 * These game anchors do not replace dated census observations.
 */
import { allocatePopulationTotal } from "@/lib/seeds/rules/populationAllocation";
import { NATIONAL_FIGURES_2027 } from "./nationalFigures2027";

/** National 2027 population totals, the same figures the 2027 budget rows carry. */
export const MODERN_REGIONAL_POPULATION_ANCHORS_2027 = {
  IE: NATIONAL_FIGURES_2027.IE.population,
  CN: NATIONAL_FIGURES_2027.CN.population,
  NG: NATIONAL_FIGURES_2027.NG.population,
  FR: NATIONAL_FIGURES_2027.FR.population,
  IT: NATIONAL_FIGURES_2027.IT.population,
  ES: NATIONAL_FIGURES_2027.ES.population,
  SE: NATIONAL_FIGURES_2027.SE.population,
  GR: NATIONAL_FIGURES_2027.GR.population,
  AT: NATIONAL_FIGURES_2027.AT.population,
  FI: NATIONAL_FIGURES_2027.FI.population,
  TR: NATIONAL_FIGURES_2027.TR.population,
} as const;

export type ModernRegionalPopulationCountry = keyof typeof MODERN_REGIONAL_POPULATION_ANCHORS_2027;

/** Keep regional ratios and allocate integer residents to the fiscal anchor. */
export function modernRegionalPopulation2027<T extends { _id: string; population: number }>(
  countryId: ModernRegionalPopulationCountry,
  regions: readonly T[]
): T[] {
  return allocatePopulationTotal(regions, MODERN_REGIONAL_POPULATION_ANCHORS_2027[countryId]);
}
