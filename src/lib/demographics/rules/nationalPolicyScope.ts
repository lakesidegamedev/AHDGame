import { getFederalMultiplier } from "@shared/constants/formulas";

/** Preserve authored legacy scopes; other countries share their law across their own regions. */
export function nationalDemographicScope(countryId: string, regionCount: number): number {
  if (["US", "UK", "JP", "DE"].includes(countryId)) return getFederalMultiplier(countryId);
  return Number.isSafeInteger(regionCount) && regionCount > 0 ? 1 / regionCount : 0;
}
