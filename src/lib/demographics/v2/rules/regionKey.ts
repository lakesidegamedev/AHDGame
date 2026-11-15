/** National electorate ids can equal another country's region id, such as CA. */
export function demographicsRegionKey(countryId: string, regionId: string): string {
  return `${countryId}:${regionId}`;
}
