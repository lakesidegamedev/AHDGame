import type { CountryId } from "@/lib/constants/countries";
import type { SovereigntyRegion } from "@/lib/referendum/rules/sovereigntyRegions";

/**
 * Registry regions of a country that have left: their entry can actuate and
 * its successor country now holds regions. Absence from the parent's region
 * list is not proof, since a partly seeded world also lacks regions.
 */
export function departedRegions(
  entries: readonly SovereigntyRegion[],
  countryId: string,
  seatedCountryIds: ReadonlySet<string>
): SovereigntyRegion[] {
  return entries.filter(
    (entry) =>
      entry.countryId === countryId &&
      entry.actuates &&
      entry.successorCountryId != null &&
      seatedCountryIds.has(entry.successorCountryId)
  );
}

/** Successor countries a country's registry entries can produce, for the seated-country query. */
export function successorCountryIds(
  entries: readonly SovereigntyRegion[],
  countryId: string
): CountryId[] {
  return entries.flatMap((entry) =>
    entry.countryId === countryId && entry.actuates && entry.successorCountryId
      ? [entry.successorCountryId]
      : []
  );
}

/** The state ids that left with the departed entries, each bloc expanded to its members. */
export function departedStateIds(departed: readonly SovereigntyRegion[]): string[] {
  return departed.flatMap((entry) => entry.memberRegionIds ?? [entry.regionId]);
}

/** Upper-chamber seats left once the departed regions' seats are removed. */
export function upperChamberSeatsAfterDepartures(
  baseSeats: number,
  departed: readonly SovereigntyRegion[]
): number {
  const lost = departed.reduce((sum, entry) => sum + (entry.parentUpperChamberSeats ?? 0), 0);
  return Math.max(0, baseSeats - lost);
}
