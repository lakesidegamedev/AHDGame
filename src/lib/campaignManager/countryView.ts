import { getCountryConfigForRuntime, type CountryId } from "@/lib/constants/countries";
import { getCountryDisplayName } from "@/lib/country/countryDisplayNames";

export type CountryRuntimeState = Parameters<typeof getCountryConfigForRuntime>[2];

/**
 * What Campaign Manager needs to know about the country it shows, for the
 * world's era: a 1991 Russia or Bulgaria changes its chambers as the game goes
 * on, and several countries carry era names (a saved rename wins over both).
 */
export function campaignManagerCountryView(
  countryId: CountryId,
  preset: string | undefined,
  countryState: CountryRuntimeState,
  nameOverrides: Partial<Record<CountryId, string>>
): {
  countryName: string;
  regionNoun: string;
  regionNounPlural: string;
  nationalChamberKeys: string[];
} {
  const config = getCountryConfigForRuntime(countryId, preset, countryState);
  return {
    countryName: nameOverrides[countryId] ?? getCountryDisplayName(countryId, preset),
    regionNoun: config.regionLabel ?? "Region",
    regionNounPlural: config.regionLabelPlural ?? "Regions",
    nationalChamberKeys: [
      config.legislature?.lowerChamber?.key,
      config.legislature?.upperChamber?.key,
    ].filter((k): k is string => !!k),
  };
}
