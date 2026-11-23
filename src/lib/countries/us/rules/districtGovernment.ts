/** Regions the game seeds with no governor or legislature of their own. */
const REGIONS_WITHOUT_LOCAL_GOVERNMENT: Readonly<Record<string, readonly string[]>> = {
  US: ["DC"],
};

export function regionHasNoLocalGovernment(countryId: string, regionId: string): boolean {
  return REGIONS_WITHOUT_LOCAL_GOVERNMENT[countryId]?.includes(regionId) ?? false;
}

/** Region count as players know it: the US is 50 states and DC, not 51 states. */
export function regionCountLabel(countryId: string, count: number, plural: string): string {
  const districts = REGIONS_WITHOUT_LOCAL_GOVERNMENT[countryId] ?? [];
  if (districts.length && count > districts.length)
    return `${count - districts.length} ${plural.toLowerCase()} and ${districts.join(", ")}`;
  return `${count} ${plural.toLowerCase()}`;
}
