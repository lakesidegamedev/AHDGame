/**
 * Exchange Registry — config-driven stock exchange lookups.
 *
 * All mappings are derived from the country registry's exchangeName.
 * Adding a country with an exchangeName automatically registers its exchange.
 * No hardcoded NYSE/FTSE/Nikkei values outside this file and countries.ts.
 *
 * Reads `COUNTRY_DISPLAY_LABELS` rather than the full registry: the generated
 * projection carries `exchangeName` and `exchangeKind`, and this module is on
 * the stock market and election page graphs. Importing `countries.ts` here
 * pulled every country's institutions, economy and era files into those
 * bundles for two string fields.
 */

import { COUNTRY_ORDER, type CountryId } from "./countriesCore";
import { COUNTRY_DISPLAY_LABELS } from "./countryDisplayLabels";

export interface ExchangeInfo {
  countryId: CountryId;
  /** Display name: "NYSE", "FTSE", "Nikkei", "GOSPLAN", etc. */
  exchangeName: string;
  /** Lowercase API key: "nyse", "ftse", "nikkei", "gosplan", etc. */
  apiKey: string;
  /** "market" = tradable bourse; "stateRegister" = command-economy enterprise register. */
  kind: "market" | "stateRegister";
}

/**
 * Lowercase, URL-safe key for an exchange name. Whitespace collapses to a
 * hyphen so a multi-word register ("GOSPLAN BSSR") does not put a space into
 * `?exchange=` query strings or into `stockExchangeSnapshots._id`. This is a
 * no-op for every single-word exchange name, so live snapshot ids are unchanged.
 */
function toApiKey(exchangeName: string): string {
  return exchangeName.toLowerCase().replace(/\s+/g, "-");
}

/**
 * One row per COUNTRY that declares an exchangeName.
 *
 * Iterates COUNTRY_ORDER first (so display order is stable and matches the rest
 * of the app), then any remaining configured country key. That tail matters:
 * SCO, WAL, BAL and BLR are configured countries that are deliberately absent
 * from COUNTRY_ORDER, and building only from COUNTRY_ORDER left them with no
 * resolvable exchange at all, so their corporations fell through to whatever
 * fallback the caller used (NYSE).
 */
function buildCountryEntries(): ExchangeInfo[] {
  const ordered: CountryId[] = [
    ...COUNTRY_ORDER,
    ...(Object.keys(COUNTRY_DISPLAY_LABELS) as CountryId[]).filter(
      (id) => !COUNTRY_ORDER.includes(id)
    ),
  ];

  return ordered
    .map((id) => [id, COUNTRY_DISPLAY_LABELS[id]] as const)
    .filter(([, config]) => config?.exchangeName)
    .map(([id, config]) => ({
      countryId: id,
      exchangeName: config.exchangeName!,
      apiKey: toApiKey(config.exchangeName!),
      kind: config.exchangeKind ?? ("market" as const),
    }));
}

/** Per-country venue rows. Several countries may share one venue (UK/SCO/WAL → FTSE). */
const COUNTRY_ENTRIES: ExchangeInfo[] = buildCountryEntries();

/**
 * All registered exchanges — one row per VENUE, deduped by apiKey (first wins).
 *
 * Deduping is load-bearing: the turn snapshot writes one `stockExchangeSnapshots`
 * document per entry keyed on `apiKey`, so three FTSE rows would collide on _id.
 */
export const ALL_EXCHANGES: ExchangeInfo[] = COUNTRY_ENTRIES.filter(
  (entry, index) => COUNTRY_ENTRIES.findIndex((e) => e.apiKey === entry.apiKey) === index
);

/** Set of valid lowercase API keys (for validation). Includes "global". */
export const EXCHANGE_API_KEYS: Set<string> = new Set([
  "global",
  ...ALL_EXCHANGES.map((e) => e.apiKey),
]);

/** Map: apiKey → ExchangeInfo (one venue per key) */
export const BY_API_KEY = new Map(ALL_EXCHANGES.map((e) => [e.apiKey, e]));

/** Map: countryId → ExchangeInfo (every configured country, shared venues included) */
export const BY_COUNTRY = new Map(COUNTRY_ENTRIES.map((e) => [e.countryId, e]));
