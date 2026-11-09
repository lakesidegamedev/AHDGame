/**
 * A region's political lean read from its census electorate (turnout-weighted
 * mean over the Layer-1 cells), for displays that need a lean when no cached
 * one is stored.
 */
import type { StateDemographics } from "@/lib/db/types";
import { calculateStateLean, type CalculatedLean } from "@/lib/utils/demographics";
import { buildGranularElectorateSubstrate } from "./granularElectorate";

export interface CensusLeanContext {
  countryId: string;
  stateId: string;
  preset?: string | null;
  year?: number | null;
  startingYear?: number | null;
}

export function censusStateLean(
  demographics: StateDemographics,
  context: CensusLeanContext
): CalculatedLean {
  const substrate = buildGranularElectorateSubstrate({
    countryId: context.countryId,
    stateId: context.stateId,
    preset: context.preset ?? undefined,
    statePopulation: 1,
    demographics,
    enriched: [],
    year: context.year,
    startingYear: context.startingYear,
  });
  if (!substrate) {
    throw new Error(`No census electorate for ${context.countryId} region ${context.stateId}`);
  }
  return calculateStateLean(substrate.demographics, substrate.categories);
}
