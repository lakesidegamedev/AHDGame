/**
 * Background economy of a region: the part of regional output outside the
 * simulated plants, as one revenue term per operating lane.
 *
 * It is a pure function of the region's GDP, country and the world preset, with
 * the same lane weights the opening markets were sized by. It exists only so
 * growth, economic-model, infrastructure and environment metrics keep a
 * denominator that does not swing with plant counts. It limits nothing: no
 * build, founding or sale reads it.
 */
import type { CountryId } from "@/lib/constants/countries";
import {
  OPERATING_SECTOR_TYPES,
  type OperatingSectorType,
} from "@/lib/constants/corporationsClient";
import { computeStateEnterpriseSeedRevenue } from "@/lib/seeds/reference/stateEnterpriseSizing";
import { isBackgroundInPreset } from "@/lib/world/eraRoster";

export interface BackgroundSectorMass {
  /** ₳ revenue of the lane's background economy in the region. */
  revenue: number;
  sectorType: OperatingSectorType;
}

/** One entry per operating lane; empty for a background-roster country. */
export function backgroundSectorMass(
  state: { _id: string; gdp: number; countryId: string },
  preset: string
): BackgroundSectorMass[] {
  if (isBackgroundInPreset(preset, state.countryId)) return [];
  const gdp = Number.isFinite(state.gdp) ? Math.max(0, state.gdp) : 0;
  return OPERATING_SECTOR_TYPES.map((lane) => ({
    sectorType: lane,
    revenue: computeStateEnterpriseSeedRevenue({
      gdp,
      countryId: state.countryId as CountryId,
      stateId: state._id,
      sectorType: lane,
      preset,
    }),
  }));
}
