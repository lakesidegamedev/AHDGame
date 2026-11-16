import type { SovereigntyRegion } from "@/lib/referendum/rules/sovereigntyRegions";

/**
 * Registry regions of a country that have left: their entry can actuate and
 * the region no longer exists among the country's live regions. An empty
 * region list means nothing is seeded yet, so nothing counts as departed.
 */
export function departedRegions(
  entries: readonly SovereigntyRegion[],
  countryId: string,
  liveRegionIds: ReadonlySet<string>
): SovereigntyRegion[] {
  if (liveRegionIds.size === 0) return [];
  return entries.filter(
    (entry) => entry.countryId === countryId && entry.actuates && !liveRegionIds.has(entry.regionId)
  );
}

/** Upper-chamber seats left once the departed regions' seats are removed. */
export function upperChamberSeatsAfterDepartures(
  baseSeats: number,
  departed: readonly SovereigntyRegion[]
): number {
  const lost = departed.reduce((sum, entry) => sum + (entry.parentUpperChamberSeats ?? 0), 0);
  return Math.max(0, baseSeats - lost);
}
