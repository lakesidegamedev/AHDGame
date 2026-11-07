/**
 * How the turn engine runs each country (#5702).
 *
 * - `player`: registered and open to players. The US is always here: it runs
 *   off the global game state and has no per-country row.
 * - `npp`: registered, run by the full simulation, not open to players.
 * - `background`: registered (country document, currency, exchange rate) but
 *   outside the full simulation. Every per-country turn phase skips it.
 * - `absent`: not registered in this world (era-absent, dissolved, or never
 *   activated).
 *
 * Plain data in, plain data out, so the same answer holds in every host.
 */
export type CountryTier = "player" | "npp" | "background" | "absent";

/** The fields of a `countryGameStates` row the tier depends on. */
export interface CountryTierRow {
  _id: string;
  enabledForPlayers?: boolean;
  backgroundCountry?: boolean;
}

/** The country that runs off the global game state and has no tier row. */
export const GLOBAL_STATE_COUNTRY_ID = "US";

/**
 * Tier of one country. `registered` is the registry's answer, so era absence,
 * dissolution and activation keep exactly one definition.
 *
 * Background wins over `enabledForPlayers`: a country without seeded regions,
 * corporations or politicians cannot be opened by an access toggle alone.
 */
export function resolveCountryTier(
  countryId: string,
  registered: boolean,
  row: CountryTierRow | undefined
): CountryTier {
  if (!registered) return "absent";
  if (row?.backgroundCountry === true) return "background";
  if (countryId === GLOBAL_STATE_COUNTRY_ID || row?.enabledForPlayers === true) return "player";
  return "npp";
}

/** True for the tiers the full simulation runs. */
export function isFullSimulationTier(tier: CountryTier): boolean {
  return tier === "player" || tier === "npp";
}
