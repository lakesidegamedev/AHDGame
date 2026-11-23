import { getStateDisplayName } from "@/lib/commodity-map/commodityRegionMappings";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { US_STATE_AND_DC_NAMES } from "@/lib/countries/us/data/usStateNames";
import { formatElectionTypeLabel } from "@/lib/utils/electionLabels";

/** A region's display name: "Ohio" for US states, the country's own table elsewhere. */
export function formatRaceRegion(region: string, countryId: CountryId = COUNTRY_CONFIGS.US.id): string {
  if (countryId === COUNTRY_CONFIGS.US.id) return US_STATE_AND_DC_NAMES[region] ?? region;
  return getStateDisplayName(countryId, region);
}

/** "State Senate race in Ohio", from raw election type and region ids. */
export function formatRaceInRegion(
  electionType: string,
  region: string,
  countryId: CountryId = COUNTRY_CONFIGS.US.id
): string {
  return `${formatElectionTypeLabel(electionType, countryId)} race in ${formatRaceRegion(region, countryId)}`;
}
