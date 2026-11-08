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
 * Derive the lean persisted on state cache documents.
 *
 * The calibrated US electorate lives in the era-aware granular substrate:
 * `DEMOGRAPHIC_POSITIONS` authors a position table per era and
 * `STATE_POSITION_OVERRIDES` layers a regional map on the anchor eras, with
 * `getEraPositionsForYear` blending forward between anchors.
 *
 * Non-substrate worlds fall back to `calculateStateLean`, which reads the
 * era-invariant `defaultEconomicLean`/`defaultSocialLean` constants on the 12
 * demographic groups. Those are modern-calibrated and their two axes are
 * ~0.88 collinear, so any weighted mix is collinear too: the social axis
 * carries no independent information. The engine (`presidentialElectionEngine`,
 * `electionEngine/tallyManagement`) already builds the substrate for every
 * preset, so the cache would disagree with how votes are actually decided.
 *
 * The collinearity is fixed in the authored position tables (see
 * `leanAxisIndependence.test.ts`). Unifying the cache and engine paths needs
 * its own calibration audit, not a ride-along with a data fix.
 */
export function calculateStateLeanForCache(
  demographics: StateDemographics,
  categories: DemographicCategory[],
  context: CachedStateLeanContext
): CalculatedLean {
  if (context.countryId !== "US" || context.preset !== "1953-default") {
    return calculateStateLean(demographics, categories);
  }

  const substrate = buildGranularElectorateSubstrate({
    countryId: context.countryId,
    stateId: context.stateId,
    preset: context.preset,
    turnoutDoc: context.turnoutDoc,
    statePopulation: 1,
    demographics,
    categories,
    demographicDefaults: context.demographicDefaults,
    year: context.year,
    startingYear: context.startingYear,
    enriched: [],
  });

  if (!substrate) return calculateStateLean(demographics, categories);
  return calculateStateLean(substrate.demographics, substrate.categories);
}
