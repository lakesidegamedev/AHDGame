import type { CountryId } from "@/lib/constants/countriesCore";

/**
 * What to call each country, and the handful of era aliases that rename one.
 *
 * This is the only part of the generated country client config that the root
 * tree needs: `RegisteredCountriesContext` resolves names for the navbar, the
 * nation switcher and every client surface that shows a country. Importing it
 * from `countryClientConfig` pulled the whole 154 KB projected config (chambers,
 * office types, currency and route tables) into the shared layout bundle for a
 * single string per country.
 *
 * `countryDisplayNames.test.ts` pins every entry to `COUNTRY_CLIENT_CONFIGS`, so
 * a seed rename that is not mirrored here fails the build.
 */
const COUNTRY_NAMES: Record<CountryId, string> = {
  US: "United States",
  UK: "United Kingdom",
  DE: "Germany",
  JP: "Japan",
  IE: "Ireland",
  SCO: "Scotland",
  WAL: "Wales",
  BR: "Brazil",
  CN: "China",
  NG: "Nigeria",
  HU: "Hungary",
  PL: "Poland",
  RO: "Romania",
  YU: "Yugoslavia",
  BG: "Bulgaria",
  BLR: "Belarus",
  CS: "Czechoslovakia",
  UKR: "Ukraine",
  BAL: "Baltic Republics",
  RU: "Russia",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  SE: "Sweden",
  TR: "Turkey",
  GR: "Greece",
  AT: "Austria",
  FI: "Finland",
  DD: "East Germany",
};

const COUNTRY_ERA_NAMES: Record<string, Partial<Record<CountryId, string>>> = {
  "1953-default": {
    DE: "West Germany",
    RU: "Soviet Union",
  },
  "1979-default": {
    DE: "West Germany",
    RU: "Soviet Union",
  },
  "1991-default": {
    RU: "Soviet Union",
  },
};

/** Country name for display, honoring per-era overrides when a preset is known. */
export function getCountryDisplayName(id: CountryId, preset?: string): string {
  const override = preset ? COUNTRY_ERA_NAMES[preset]?.[id] : undefined;
  return override ?? (Object.hasOwn(COUNTRY_NAMES, id) ? COUNTRY_NAMES[id] : id);
}
