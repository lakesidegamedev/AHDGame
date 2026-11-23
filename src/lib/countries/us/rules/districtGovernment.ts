/** Regions the game seeds with no governor or legislature of their own. */
const REGIONS_WITHOUT_LOCAL_GOVERNMENT: Readonly<Record<string, readonly string[]>> = {
  US: ["DC"],
};

export function regionHasNoLocalGovernment(countryId: string, regionId: string): boolean {
  return REGIONS_WITHOUT_LOCAL_GOVERNMENT[countryId]?.includes(regionId) ?? false;
}
