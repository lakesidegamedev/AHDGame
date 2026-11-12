import { regionExecutiveTitleOverride } from "@/lib/countries/regionalExecutiveTitles";
import {
  getExecutiveOrderNameForGovernmentType,
  getExecutiveOrderNamePluralForGovernmentType,
  COUNTRY_ORDER,
  type CountryId,
} from "./countriesCore";
import type {
  CountryClientConfig,
  CountryClientOfficeType,
} from "@/lib/countries/clientConfigTypes";
import {
  CLIENT_COUNTRY_IDS,
  CLIENT_FILES,
  restoreCleared,
} from "@/lib/countries/clientConfigFiles";

export type {
  CountryClientCentralBankConfig,
  CountryClientChamberConfig,
  CountryClientConfig,
  CountryClientLegislatureConfig,
  CountryClientOfficeType,
} from "@/lib/countries/clientConfigTypes";

/**
 * The client-safe slice of the country registry: display names, chamber keys
 * and labels, currency codes, routes, government type and office labels. Each
 * country's slice is `countries/<cc>/data/clientConfig.json`, written by
 * `scripts/countries/gen-country-client-config.ts`; this registry composes
 * them so the browser never loads the full registry.
 */

/** Every country, projected to {@link CountryClientConfig}. */
export const COUNTRY_CLIENT_CONFIGS = Object.fromEntries(
  CLIENT_COUNTRY_IDS.map((id) => [id, CLIENT_FILES[id].config])
) as Record<CountryId, CountryClientConfig>;

/**
 * Per-era institutional overlays, applied by {@link getCountryClientConfig}
 * with the same shallow merge as the full registry's `getCountryConfig`.
 */
const COUNTRY_CLIENT_ERA_CONFIG_OVERRIDES: Record<
  string,
  Partial<Record<CountryId, Partial<CountryClientConfig>>>
> = {};
for (const id of CLIENT_COUNTRY_IDS) {
  for (const [preset, override] of Object.entries(CLIENT_FILES[id].eraOverrides ?? {})) {
    (COUNTRY_CLIENT_ERA_CONFIG_OVERRIDES[preset] ??= {})[id] = restoreCleared(override);
  }
}

/** Every configured country id, including the latent secession countries. */
export const ALL_COUNTRY_IDS: readonly CountryId[] = CLIENT_COUNTRY_IDS;

/** Default `countryId` when legacy documents omit it. */
export const DEFAULT_LEGACY_COUNTRY_ID: CountryId = "US";

/** Client-safe `getCountryConfig`: same id, same preset merge, narrow shape. */
export function getCountryClientConfig(id: CountryId, preset?: string): CountryClientConfig {
  const base = COUNTRY_CLIENT_CONFIGS[id];
  const override = preset ? COUNTRY_CLIENT_ERA_CONFIG_OVERRIDES[preset]?.[id] : undefined;
  if (!override) return base;
  return { ...base, ...override };
}

/** Per-era display names ("West Germany" while the GDR exists), by preset then country. */
const COUNTRY_CLIENT_ERA_NAMES: Record<string, Partial<Record<CountryId, string>>> = {};
for (const id of CLIENT_COUNTRY_IDS) {
  for (const [preset, name] of Object.entries(CLIENT_FILES[id].eraNames ?? {})) {
    (COUNTRY_CLIENT_ERA_NAMES[preset] ??= {})[id] = name;
  }
}

/** Country name for display, honoring per-era overrides when a preset is known. */
export function getCountryDisplayName(id: CountryId, preset?: string): string {
  const override = preset ? COUNTRY_CLIENT_ERA_NAMES[preset]?.[id] : undefined;
  const config = Object.hasOwn(COUNTRY_CLIENT_CONFIGS, id) ? COUNTRY_CLIENT_CONFIGS[id] : undefined;
  return override ?? config?.name ?? id;
}

/** Reverse lookup: full country name ("United Kingdom") to ISO `CountryId` ("UK"). */
const COUNTRY_NAME_TO_ID: Record<string, CountryId> = Object.fromEntries(
  COUNTRY_ORDER.map((id) => [COUNTRY_CLIENT_CONFIGS[id].name, id])
);

export function getCountryIdByName(name: string): CountryId | null {
  return COUNTRY_NAME_TO_ID[name] ?? null;
}

/** `COUNTRY_CONFIGS[id].officeTypes` entry for one office key, or undefined. */
export function getOfficeTypeConfig(
  countryId: CountryId,
  officeKey: string,
  preset?: string
): CountryClientOfficeType | undefined {
  return getCountryClientConfig(countryId, preset).officeTypes.find((o) => o.key === officeKey);
}

/** Maps country to the office key used for regional executive assent on state bills. */
const REGIONAL_BILL_ASSENT_OFFICE_KEY: Partial<Record<CountryId, string>> = {};
for (const id of CLIENT_COUNTRY_IDS) {
  const key = CLIENT_FILES[id].regionalAssentOfficeKey;
  if (key) REGIONAL_BILL_ASSENT_OFFICE_KEY[id] = key;
}

/** Short label for the regional chief executive who signs or vetoes sub-national bills. */
export function getRegionalBillAssentTitle(countryId: CountryId): string {
  const cfg = COUNTRY_CLIENT_CONFIGS[countryId];
  if (cfg.regionalBillAssentTitle) return cfg.regionalBillAssentTitle;
  const key = REGIONAL_BILL_ASSENT_OFFICE_KEY[countryId];
  if (key) {
    const office = getOfficeTypeConfig(countryId, key);
    if (office) return office.label;
  }
  return "Governor";
}

/** Region-aware regional-executive label (London's mayor, Irish lord mayors). */
export function getRegionalBillAssentTitleForState(
  countryId: CountryId,
  stateId: string | undefined | null
): string {
  return regionExecutiveTitleOverride(countryId, stateId) ?? getRegionalBillAssentTitle(countryId);
}

/** The officeType key of the country's regional chief executive. */
export function getRegionalExecutiveOfficeKey(countryId: CountryId): string {
  return REGIONAL_BILL_ASSENT_OFFICE_KEY[countryId] ?? "governor";
}

/** Office-type key for the sub-national legislature, defaulting to the US-style key. */
export function getSubNationalLegislatureKey(countryId: CountryId): string {
  const config = getCountryClientConfig(countryId);
  if (config.subNationalChamber) return config.subNationalChamber.key;
  return "stateSenate";
}

/** User-facing name of the national-level address. */
const NATIONAL_ADDRESS_NAME: Partial<Record<CountryId, string>> = {};
for (const id of CLIENT_COUNTRY_IDS) {
  const name = CLIENT_FILES[id].nationalAddressName;
  if (name) NATIONAL_ADDRESS_NAME[id] = name;
}

export function getNationalAddressName(countryId: CountryId): string {
  return NATIONAL_ADDRESS_NAME[countryId] ?? "Address to the Nation";
}

/** User-facing name for the head-of-government order at the national scope. */
export function getExecutiveOrderName(countryId: CountryId): string {
  const config = COUNTRY_CLIENT_CONFIGS[countryId];
  return getExecutiveOrderNameForGovernmentType(config?.governmentType);
}

/** Plural form for headers ("Executive Orders" vs "Orders in Council"). */
export function getExecutiveOrderNamePlural(countryId: CountryId): string {
  const config = COUNTRY_CLIENT_CONFIGS[countryId];
  return getExecutiveOrderNamePluralForGovernmentType(config?.governmentType);
}
