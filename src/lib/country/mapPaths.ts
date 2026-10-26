import type { CountryId } from "@/lib/constants/countriesCore";

/**
 * Route to a country's map page.
 *
 * `worldNavItems` needs exactly this one string per country. Reading it from the
 * generated country client config pulled all 154 KB of that config into the
 * shared navbar chunk. UKR keeps its historical `/country/ua/map` slug, so this
 * cannot be derived by lowercasing the id. `mapPaths.test.ts` pins every entry
 * to the config.
 */
const COUNTRY_MAP_PATHS: Record<CountryId, string> = {
  US: "/country/us/map",
  UK: "/country/uk/map",
  DE: "/country/de/map",
  JP: "/country/jp/map",
  IE: "/country/ie/map",
  SCO: "/country/sco/map",
  WAL: "/country/wal/map",
  BR: "/country/br/map",
  CN: "/country/cn/map",
  NG: "/country/ng/map",
  HU: "/country/hu/map",
  PL: "/country/pl/map",
  RO: "/country/ro/map",
  YU: "/country/yu/map",
  BG: "/country/bg/map",
  BLR: "/country/blr/map",
  CS: "/country/cs/map",
  UKR: "/country/ua/map",
  BAL: "/country/bal/map",
  RU: "/country/ru/map",
  FR: "/country/fr/map",
  IT: "/country/it/map",
  ES: "/country/es/map",
  SE: "/country/se/map",
  TR: "/country/tr/map",
  GR: "/country/gr/map",
  AT: "/country/at/map",
  FI: "/country/fi/map",
  DD: "/country/dd/map",
};

export function getCountryMapPath(id: CountryId): string {
  return COUNTRY_MAP_PATHS[id] ?? `/country/${id.toLowerCase()}/map`;
}
