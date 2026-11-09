import type {
  DemographicCategory,
  StateDemographics,
  StateDemographicTurnout,
} from "@/lib/db/types";
import { buildGranularElectorateSubstrate } from "@/lib/demographics/granularElectorate";
import { calculateStateLean, type CalculatedLean } from "@/lib/utils/demographics";

export interface CachedStateLeanContext {
  countryId: string;
  stateId: string;
  preset?: string | null;
  turnoutDoc?: StateDemographicTurnout | null;
  demographicDefaults?: StateDemographics | null;
  year?: number | null;
  startingYear?: number | null;
}

/**
 * The lean persisted on state cache documents, read from the region's census
 * electorate with the live drift and durable overlays folded in. Null when the
 * region has no census (background and economy-only countries).
 */
export function censusCachedStateLean(
  demographics: StateDemographics,
  context: CachedStateLeanContext
): CalculatedLean | null {
  const substrate = buildGranularElectorateSubstrate({
    countryId: context.countryId,
    stateId: context.stateId,
    preset: context.preset ?? undefined,
    turnoutDoc: context.turnoutDoc,
    statePopulation: 1,
    demographics,
    demographicDefaults: context.demographicDefaults,
    year: context.year,
    startingYear: context.startingYear,
    enriched: [],
  });
  if (!substrate) return null;
  return calculateStateLean(substrate.demographics, substrate.categories);
}

/** Same lean, but a region without a census is an error rather than a null. */
export function calculateStateLeanForCache(
  demographics: StateDemographics,
  _categories: DemographicCategory[],
  context: CachedStateLeanContext
): CalculatedLean {
  const lean = censusCachedStateLean(demographics, context);
  if (!lean) {
    throw new Error(`No census electorate for ${context.countryId} region ${context.stateId}`);
  }
  return lean;
}
