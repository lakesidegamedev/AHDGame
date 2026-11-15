import type { CountryId } from "@/lib/constants/countriesCore";
import { IE_REGIONAL_EXECUTIVE_TITLES } from "./ie/regionalExecutiveTitles";
import { UK_REGIONAL_EXECUTIVE_TITLES } from "./uk/regionalExecutiveTitles";

/** Per-country region titles that differ from the country-level regional executive title. */
const REGIONAL_EXECUTIVE_TITLES: Partial<Record<CountryId, Readonly<Record<string, string>>>> = {
  UK: UK_REGIONAL_EXECUTIVE_TITLES,
  IE: IE_REGIONAL_EXECUTIVE_TITLES,
};

/** The region's own executive title, or undefined when it uses the country's. */
export function regionExecutiveTitleOverride(
  countryId: CountryId,
  stateId: string | undefined | null
): string | undefined {
  if (!stateId) return undefined;
  return REGIONAL_EXECUTIVE_TITLES[countryId]?.[stateId.toUpperCase()];
}
