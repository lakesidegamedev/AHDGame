import { getStateDisplayName } from "@/lib/commodity-map/commodityRegionMappings";
import type { CountryId } from "@/lib/constants/countriesCore";
import { US_STATE_AND_DC_NAMES } from "@/lib/countries/us/data/usStateNames";
import { formatElectionTypeLabel } from "@/lib/utils/electionLabels";

/** Countries whose region names live outside the shared display table. */
const EXTRA_REGION_NAMES: Partial<Record<CountryId, Readonly<Record<string, string>>>> = {
  US: US_STATE_AND_DC_NAMES,
};

/** A region's display name, for example "Ohio" rather than "OH". */
export function formatRaceRegion(region: string, countryId: CountryId = "US"): string {
  return EXTRA_REGION_NAMES[countryId]?.[region] ?? getStateDisplayName(countryId, region);
}

/** "State Senate race in Ohio", from raw election type and region ids. */
export function formatRaceInRegion(
  electionType: string,
  region: string,
  countryId: CountryId = "US"
): string {
  return `${formatElectionTypeLabel(electionType, countryId)} race in ${formatRaceRegion(region, countryId)}`;
}
