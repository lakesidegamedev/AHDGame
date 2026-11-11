import type { CountryId } from "./countriesCore";
import { regionExecutiveTitleOverride } from "@/lib/countries/regionalExecutiveTitles";
import type {
  CountryOfficeConfig,
  CountryOfficeTypeConfig,
} from "@/lib/countries/clientConfigTypes";
import {
  CLIENT_COUNTRY_IDS,
  OFFICE_FILES,
  restoreCleared,
} from "@/lib/countries/clientConfigFiles";

export type {
  CountryOfficeChamberConfig,
  CountryOfficeConfig,
  CountryOfficeLegislatureConfig,
  CountryOfficeTypeConfig,
} from "@/lib/countries/clientConfigTypes";

/**
 * The institutional slice of the country registry: chambers, office types,
 * government type and the regional executive. Each country's slice is
 * `countries/<cc>/data/officesClient.json`, written by
 * `scripts/countries/gen-country-client-config.ts`.
 *
 * The elections list, office resolution and the state legislature and bill
 * pages read this instead of the full client config, so they do not ship
 * names, routes, currencies, central banks and election systems.
 */

/** Every country's chambers and offices. */
export const COUNTRY_OFFICES = Object.fromEntries(
  CLIENT_COUNTRY_IDS.map((id) => [id, OFFICE_FILES[id].config])
) as Record<CountryId, CountryOfficeConfig>;

/** Per-era chamber and office overlays, applied by {@link getCountryOfficeConfig}. */
const COUNTRY_OFFICE_ERA_OVERRIDES: Record<
  string,
  Partial<Record<CountryId, Partial<CountryOfficeConfig>>>
> = {};
for (const id of CLIENT_COUNTRY_IDS) {
  for (const [preset, override] of Object.entries(OFFICE_FILES[id].eraOverrides ?? {})) {
    (COUNTRY_OFFICE_ERA_OVERRIDES[preset] ??= {})[id] = restoreCleared(override);
  }
}

/** Client-safe office config for a country, honoring a preset's overlays. */
export function getCountryOfficeConfig(id: CountryId, preset?: string): CountryOfficeConfig {
  const base = COUNTRY_OFFICES[id];
  const override = preset ? COUNTRY_OFFICE_ERA_OVERRIDES[preset]?.[id] : undefined;
  if (!override) return base;
  return { ...base, ...override };
}

/** `COUNTRY_OFFICES[id].officeTypes` entry for one office key, or undefined. */
export function getCountryOfficeType(
  id: CountryId,
  officeKey: string
): CountryOfficeTypeConfig | undefined {
  return COUNTRY_OFFICES[id].officeTypes.find((o) => o.key === officeKey);
}

/**
 * The office type of each country's regional chief executive. Countries the
 * registry does not list fall back to the US-style "governor" key.
 */
const REGIONAL_BILL_ASSENT_OFFICE_KEY: Partial<Record<CountryId, string>> = {};
for (const id of CLIENT_COUNTRY_IDS) {
  const key = OFFICE_FILES[id].regionalAssentOfficeKey;
  if (key) REGIONAL_BILL_ASSENT_OFFICE_KEY[id] = key;
}

/** The officeType key of the country's regional chief executive. */
export function getRegionalExecutiveOfficeKey(countryId: CountryId): string {
  return REGIONAL_BILL_ASSENT_OFFICE_KEY[countryId] ?? "governor";
}

/** Short label for the regional chief executive who signs or vetoes regional bills. */
export function getRegionalBillAssentTitle(countryId: CountryId): string {
  const cfg = COUNTRY_OFFICES[countryId];
  if (cfg.regionalBillAssentTitle) return cfg.regionalBillAssentTitle;
  const key = REGIONAL_BILL_ASSENT_OFFICE_KEY[countryId];
  const office = key ? cfg.officeTypes.find((o) => o.key === key) : undefined;
  return office?.label ?? "Governor";
}

/**
 * Region-aware regional-executive label. Two countries give particular regions
 * a distinct title (London's mayor, Ireland's lord mayors and mayors), so the
 * plain country title is not always what the page should print.
 */
/** Region-aware regional-executive label (London's mayor, Irish lord mayors). */
export function getRegionalBillAssentTitleForState(
  countryId: CountryId,
  stateId: string | undefined | null
): string {
  return regionExecutiveTitleOverride(countryId, stateId) ?? getRegionalBillAssentTitle(countryId);
}
