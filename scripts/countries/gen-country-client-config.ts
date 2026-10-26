/**
 * Writes `src/lib/constants/countryClientConfig.ts` from the full registry.
 *
 *   npx tsx scripts/countries/gen-country-client-config.ts
 *
 * ⚠ GENERATED FROM `COUNTRY_CONFIGS`, NOT TRANSCRIBED. The full registry is
 * ~112 KB of JSON and reaches 29 country institution modules plus every era
 * file. Client components need a small, fixed slice of it: names, chamber
 * labels, currency codes, paths, government type, office labels. This script
 * projects exactly that slice, once per country and once per era override, so
 * the browser bundle never loads the rest.
 *
 * ⚠ THE FIELD LIST BELOW IS THE CONTRACT. Every field a client component reads
 * must appear here, or the component's typecheck fails (it sees
 * `CountryClientConfig`). Adding one means adding it here and re-running this
 * script. `countryClientConfig.test.ts` fails the build when the generated file
 * drifts from the registry after a seed edit.
 *
 * Era overrides are projected too: `getCountryConfig(id, preset)` applies
 * `ERA_COUNTRY_CONFIG_OVERRIDES`, and client callers that pass a preset must
 * receive the same era's values, never the base country's.
 */
import { writeFileSync } from "node:fs";

import {
  COUNTRY_CONFIGS,
  DEFAULT_LEGACY_COUNTRY_ID,
  ERA_COUNTRY_CONFIG_OVERRIDES,
  ERA_COUNTRY_NAMES,
  NATIONAL_ADDRESS_NAME,
  REGIONAL_BILL_ASSENT_OFFICE_KEY,
} from "../../src/lib/constants/countries";
import type { CountryId } from "../../src/lib/constants/countriesCore";

const OUT = "src/lib/constants/countryClientConfig.ts";
const OFFICES_OUT = "src/lib/constants/countryOfficesClient.ts";
const REGENERATE = "npx tsx scripts/countries/gen-country-client-config.ts";

/** `true` keeps the whole value; an object keeps only the named projection. */
type Projection = true | { readonly [key: string]: Projection };

/**
 * The union of fields read by client modules, grouped by top-level key.
 *
 * Nested objects are projected field by field. Arrays of objects project each
 * element with the `"[]"` entry; arrays of primitives stay whole.
 */
const CLIENT_FIELDS: { readonly [key: string]: Projection } = {
  id: true,
  name: true,
  code: true,
  status: true,
  flagEmoji: true,
  regionLabel: true,
  regionLabelPlural: true,
  executiveTitle: true,
  executiveRealmPhrase: true,
  executiveLabel: true,
  executivePath: true,
  governmentType: true,
  governmentTypeLabel: true,
  descriptor: true,
  heroImage: true,
  overviewHeroImage: true,
  overviewPath: true,
  mapPath: true,
  currencyCode: true,
  centralGovernmentLabel: true,
  exchangeName: true,
  exchangeKind: true,
  financeMinisterCabinetId: true,
  demographicProfileId: true,
  regionalBillAssentTitle: true,
  rulingPartyId: true,
  opsVoteMultipliers: true,
  hasLeaderConfidenceModel: true,
  majorPartyIds: true,
  partyCreationNPPs: {
    statesRequired: true,
    lockHomeState: true,
    nppsPerState: true,
  },
  partyRoleLabels: {
    chair: true,
    viceChair: true,
    treasurer: true,
    committee: true,
  },
  executiveTermLimit: {
    officeKey: true,
    maxTermsPerCharacter: true,
    blocksRunningMateSelection: true,
  },
  legislature: {
    name: true,
    path: true,
    bicameral: true,
    lowerChamber: {
      key: true,
      name: true,
      shortName: true,
      seats: true,
      description: true,
    },
    upperChamber: {
      key: true,
      name: true,
      shortName: true,
      seats: true,
      description: true,
      elected: true,
      regionElectedClasses: true,
    },
  },
  subNationalChamber: {
    key: true,
    name: true,
    shortName: true,
    regionalModel: true,
  },
  officeTypes: {
    "[]": {
      key: true,
      label: true,
      chamberKey: true,
      isExecutive: true,
      isSubNational: true,
      isHeadOfState: true,
      labelPlural: true,
    },
  },
  electionSystems: true,
  lowerElectionSystem: {
    snapElectionsAllowed: true,
  },
  upperElectionSystem: {
    snapElectionsAllowed: true,
  },
  centralBank: {
    name: true,
    abbreviation: true,
    heroImage: true,
    heroAlt: true,
    defaultPrimeRate: true,
    sharedBankId: true,
    centralBankIntorgId: true,
  },
  usdExchangeRate: true,
};

/**
 * The chamber and office slice, written to `countryOfficesClient.ts`.
 *
 * The elections list groups races by office and builds its race filter from
 * these tables, and `officeResolution.ts` maps an election type to the office
 * it fills. All three read nothing else from a country, so they take this
 * projection instead of the full client config: same values, without the
 * names, routes, currencies, central banks and election systems.
 */
const OFFICE_FIELDS: { readonly [key: string]: Projection } = {
  governmentType: true,
  regionalBillAssentTitle: true,
  legislature: {
    name: true,
    lowerChamber: {
      key: true,
      name: true,
      shortName: true,
      seats: true,
      regionElectedClasses: true,
    },
    upperChamber: {
      key: true,
      name: true,
      shortName: true,
      seats: true,
      elected: true,
      regionElectedClasses: true,
    },
  },
  subNationalChamber: {
    key: true,
    name: true,
    shortName: true,
    regionalModel: true,
  },
  officeTypes: {
    "[]": {
      key: true,
      label: true,
      labelPlural: true,
      chamberKey: true,
      isExecutive: true,
      isSubNational: true,
      isHeadOfState: true,
    },
  },
  // Whether either chamber can be dissolved early. The elections list needs it
  // to recognise a snap race's type as belonging to that chamber.
  lowerElectionSystem: { snapElectionsAllowed: true },
  upperElectionSystem: { snapElectionsAllowed: true },
};

/** Drop keys from a source object that the projection does not name. */
function project(value: unknown, projection: Projection, path: string): unknown {
  if (projection === true) return value;
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    const itemProjection = projection["[]"];
    if (!itemProjection) {
      throw new Error(`${path} is an array but the projection has no "[]" entry`);
    }
    return value.map((item, index) => project(item, itemProjection, `${path}[${index}]`));
  }
  if (value === null || typeof value !== "object") {
    throw new Error(`${path} is not an object, so it cannot be projected field by field`);
  }
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(projection)) {
    if (key === "[]") continue;
    if (!(key in source)) continue;
    // An explicit `undefined` clears the base value through the shallow merge
    // \`getCountryConfig\` applies (e.g. 1953 Turkey has no upper chamber), so it
    // is carried through rather than dropped.
    out[key] = project(source[key], child, `${path}.${key}`);
  }
  return out;
}

/**
 * JSON.stringify cannot express `undefined`, and an era override uses it to
 * clear a base field. Serialize by hand, then let prettier reflow to repo style.
 */
function literal(value: unknown, depth = 0): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const indent = "  ".repeat(depth + 1);
  const closing = "  ".repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((item) => indent + literal(item, depth + 1)).join(",\n");
    return `[\n${items}\n${closing}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  const fields = entries
    .map(([key, item]) => `${indent}${JSON.stringify(key)}: ${literal(item, depth + 1)}`)
    .join(",\n");
  return `{\n${fields}\n${closing}}`;
}

const ids = Object.keys(COUNTRY_CONFIGS) as CountryId[];

const clientConfigs: Record<string, unknown> = {};
for (const id of ids) {
  clientConfigs[id] = project(COUNTRY_CONFIGS[id], CLIENT_FIELDS as Projection, id);
}

/**
 * A projected override only has to carry the fields it actually changes.
 * Dropping the rest matters: an era override is a whole \`CountryConfig\`, so
 * keeping equal values would ship the same legislature and office list once
 * per preset.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
  );
}

const eraOverrides: Record<string, Record<string, unknown>> = {};
for (const [preset, byCountry] of Object.entries(ERA_COUNTRY_CONFIG_OVERRIDES)) {
  const projected: Record<string, unknown> = {};
  for (const [id, override] of Object.entries(byCountry)) {
    if (!override) continue;
    const value = project(override, CLIENT_FIELDS as Projection, `${preset}.${id}`) as Record<
      string,
      unknown
    >;
    const base = clientConfigs[id] as Record<string, unknown>;
    const changed: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value)) {
      if (!deepEqual(field, base[key])) changed[key] = field;
    }
    if (Object.keys(changed).length > 0) projected[id] = changed;
  }
  if (Object.keys(projected).length > 0) eraOverrides[preset] = projected;
}

const officeConfigs: Record<string, unknown> = {};
for (const id of ids) {
  officeConfigs[id] = project(COUNTRY_CONFIGS[id], OFFICE_FIELDS as Projection, id);
}

/**
 * The office projection's era overlays, diffed against its own base the same
 * way the full client config's are: an era override carries a whole country,
 * so only the chambers and offices it actually changes are written out.
 */
const officeEraOverrides: Record<string, Record<string, unknown>> = {};
for (const [preset, byCountry] of Object.entries(ERA_COUNTRY_CONFIG_OVERRIDES)) {
  const projected: Record<string, unknown> = {};
  for (const [id, override] of Object.entries(byCountry)) {
    if (!override) continue;
    const value = project(override, OFFICE_FIELDS as Projection, `${preset}.${id}`) as Record<
      string,
      unknown
    >;
    const base = officeConfigs[id] as Record<string, unknown>;
    const changed: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value)) {
      if (!deepEqual(field, base[key])) changed[key] = field;
    }
    if (Object.keys(changed).length > 0) projected[id] = changed;
  }
  if (Object.keys(projected).length > 0) officeEraOverrides[preset] = projected;
}

const eraNames: Record<string, Record<string, string>> = {};
for (const [preset, byCountry] of Object.entries(ERA_COUNTRY_NAMES)) {
  const names: Record<string, string> = {};
  for (const [id, name] of Object.entries(byCountry)) {
    if (name) names[id] = name;
  }
  if (Object.keys(names).length > 0) eraNames[preset] = names;
}

const nationalAddressNames: Record<string, string> = {};
for (const [id, name] of Object.entries(NATIONAL_ADDRESS_NAME)) {
  if (name) nationalAddressNames[id] = name;
}

const regionalAssentOfficeKeys: Record<string, string> = {};
for (const [id, key] of Object.entries(REGIONAL_BILL_ASSENT_OFFICE_KEY)) {
  if (key) regionalAssentOfficeKeys[id] = key;
}

const text = `/**
 * GENERATED FILE. DO NOT EDIT BY HAND.
 *
 *   ${REGENERATE}
 *
 * The client-safe slice of the country registry: display names, chamber keys
 * and labels, currency codes, routes, government type and office labels. It
 * imports nothing but \`countriesCore\` and types, so a client component that
 * needs a country's name no longer pulls the full registry (and its 29
 * institution and era modules) into the browser bundle.
 *
 * The field list is the contract: \`scripts/countries/gen-country-client-config.ts\`
 * projects \`COUNTRY_CONFIGS\` down to it, and
 * \`countryClientConfig.test.ts\` fails when a seed edit is not regenerated.
 */
import {
  COUNTRY_ORDER,
  getExecutiveOrderNameForGovernmentType,
  getExecutiveOrderNamePluralForGovernmentType,
  type CountryId,
  type CountryStatus,
  type ElectionMethod,
  type ElectionPosition,
  type GovernmentType,
  type OpsVoteMultipliers,
} from "./countriesCore";
import type { CurrencyCode } from "./currencies";

/** One chamber as client components render it. */
export interface CountryClientChamberConfig {
  key: string;
  name: string;
  shortName: string;
  seats: number;
  description?: string;
  elected?: boolean;
  regionElectedClasses?: boolean;
  regionalModel?: boolean;
}

/** The legislature block client components read. */
export interface CountryClientLegislatureConfig {
  name: string;
  path: string;
  bicameral: boolean;
  lowerChamber: CountryClientChamberConfig;
  upperChamber?: CountryClientChamberConfig;
}

/** One office type, reduced to the fields client components display. */
export interface CountryClientOfficeType {
  key: string;
  label: string;
  labelPlural: string;
  chamberKey?: string;
  isExecutive: boolean;
  isSubNational: boolean;
  isHeadOfState?: boolean;
}

/** The central-bank identity fields a client page shows. */
export interface CountryClientCentralBankConfig {
  name: string;
  abbreviation: string;
  heroImage?: string;
  heroAlt?: string;
  defaultPrimeRate: number;
  sharedBankId?: string;
  centralBankIntorgId?: string;
}

/** One country, reduced to the fields client modules read. */
export interface CountryClientConfig {
  id: CountryId;
  name: string;
  code: string;
  flagEmoji: string;
  status: CountryStatus;
  regionLabel: string;
  regionLabelPlural: string;
  executiveTitle: string;
  executiveRealmPhrase?: string;
  executiveLabel: string;
  executivePath: string;
  governmentType: GovernmentType;
  governmentTypeLabel: string;
  descriptor: string;
  heroImage?: string;
  overviewHeroImage?: string;
  overviewPath: string;
  mapPath: string;
  currencyCode: CurrencyCode;
  centralGovernmentLabel: string;
  exchangeName?: string;
  /** "market" = tradable bourse; "stateRegister" = command-economy enterprise register. */
  exchangeKind?: "market" | "stateRegister";
  financeMinisterCabinetId?: string;
  demographicProfileId: string;
  regionalBillAssentTitle?: string;
  rulingPartyId?: number;
  opsVoteMultipliers?: OpsVoteMultipliers;
  hasLeaderConfidenceModel?: boolean;
  majorPartyIds: string[];
  partyCreationNPPs: {
    statesRequired: number;
    lockHomeState: boolean;
    nppsPerState: number;
  };
  partyRoleLabels?: {
    chair?: string;
    viceChair?: string;
    treasurer?: string;
    committee?: string;
  };
  executiveTermLimit?: {
    officeKey: string;
    maxTermsPerCharacter: number;
    blocksRunningMateSelection: boolean;
  };
  legislature: CountryClientLegislatureConfig;
  /** Sub-national chambers ship without seat counts; no client reads them. */
  subNationalChamber?: Pick<
    CountryClientChamberConfig,
    "key" | "name" | "shortName" | "regionalModel"
  >;
  officeTypes: CountryClientOfficeType[];
  electionSystems: Partial<Record<ElectionPosition, ElectionMethod>>;
  lowerElectionSystem: { snapElectionsAllowed: boolean };
  upperElectionSystem?: { snapElectionsAllowed: boolean };
  centralBank: CountryClientCentralBankConfig;
  usdExchangeRate: number;
}

/** Every country, projected to {@link CountryClientConfig}. */
export const COUNTRY_CLIENT_CONFIGS: Record<CountryId, CountryClientConfig> = ${literal(
  clientConfigs
)};

/**
 * Per-era institutional overlays, projected the same way.
 * Mirrors \`ERA_COUNTRY_CONFIG_OVERRIDES\`; applied by
 * {@link getCountryClientConfig} with the same shallow merge as the full
 * registry's \`getCountryConfig\`.
 */
const COUNTRY_CLIENT_ERA_CONFIG_OVERRIDES: Record<
  string,
  Partial<Record<CountryId, Partial<CountryClientConfig>>>
> = ${literal(eraOverrides)};

/** Every configured country id, including the latent secession countries. */
export const ALL_COUNTRY_IDS: readonly CountryId[] = Object.keys(
  COUNTRY_CLIENT_CONFIGS
) as CountryId[];

/** Default \`countryId\` when legacy documents omit it. */
export const DEFAULT_LEGACY_COUNTRY_ID: CountryId = ${JSON.stringify(DEFAULT_LEGACY_COUNTRY_ID)};

/** Client-safe \`getCountryConfig\`: same id, same preset merge, narrow shape. */
export function getCountryClientConfig(id: CountryId, preset?: string): CountryClientConfig {
  const base = COUNTRY_CLIENT_CONFIGS[id];
  const override = preset ? COUNTRY_CLIENT_ERA_CONFIG_OVERRIDES[preset]?.[id] : undefined;
  if (!override) return base;
  return { ...base, ...override };
}

/**
 * Per-era country display-name overrides. Mirrors \`ERA_COUNTRY_NAMES\`: a
 * country's base \`name\` is the era-neutral default, and some presets name it
 * differently (the FRG is "West Germany" while the GDR exists).
 */
const COUNTRY_CLIENT_ERA_NAMES: Record<string, Partial<Record<CountryId, string>>> = ${literal(
  eraNames
)};

/** Country name for display, honoring per-era overrides when a preset is known. */
export function getCountryDisplayName(id: CountryId, preset?: string): string {
  const override = preset ? COUNTRY_CLIENT_ERA_NAMES[preset]?.[id] : undefined;
  const config = Object.hasOwn(COUNTRY_CLIENT_CONFIGS, id)
    ? COUNTRY_CLIENT_CONFIGS[id]
    : undefined;
  return override ?? config?.name ?? id;
}

/** Reverse lookup: full country name ("United Kingdom") to ISO \`CountryId\` ("UK"). */
const COUNTRY_NAME_TO_ID: Record<string, CountryId> = Object.fromEntries(
  COUNTRY_ORDER.map((id) => [COUNTRY_CLIENT_CONFIGS[id].name, id])
);

export function getCountryIdByName(name: string): CountryId | null {
  return COUNTRY_NAME_TO_ID[name] ?? null;
}

/** \`COUNTRY_CONFIGS[id].officeTypes\` entry for one office key, or undefined. */
export function getOfficeTypeConfig(
  countryId: CountryId,
  officeKey: string,
  preset?: string
): CountryClientOfficeType | undefined {
  return getCountryClientConfig(countryId, preset).officeTypes.find((o) => o.key === officeKey);
}

/** Maps country to the office key used for regional executive assent on state bills. */
const REGIONAL_BILL_ASSENT_OFFICE_KEY: Partial<Record<CountryId, string>> = ${literal(
  regionalAssentOfficeKeys
)};

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

/**
 * State-aware regional-executive label. Overrides the country-level title for
 * regions whose executive has a distinct title (UK LON to "Mayor of London").
 */
const UK_COUNTRY_ID = COUNTRY_CLIENT_CONFIGS.UK.id;

export function getRegionalBillAssentTitleForState(
  countryId: CountryId,
  stateId: string | undefined | null
): string {
  if (countryId === UK_COUNTRY_ID && stateId && stateId.toUpperCase() === "LON") {
    return "Mayor of London";
  }
  if (countryId === "IE" && stateId) {
    const upper = stateId.toUpperCase();
    if (upper === "DUB") return "Lord Mayor of Dublin";
    if (upper === "COR") return "Lord Mayor of Cork";
    if (upper === "LIM") return "Mayor of Limerick";
    if (upper === "GAL") return "Mayor of Galway";
  }
  return getRegionalBillAssentTitle(countryId);
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
const NATIONAL_ADDRESS_NAME: Partial<Record<CountryId, string>> = ${literal(nationalAddressNames)};

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
`;

const officeText = `/**
 * GENERATED FILE. DO NOT EDIT BY HAND.
 *
 *   ${REGENERATE}
 *
 * The institutional slice of the country registry: chambers, office types,
 * government type and the regional executive.
 *
 * The elections list groups races into office sections and builds its race
 * filter from these tables, \`officeResolution.ts\` maps an election type to the
 * office and chamber it fills, and the state legislature and bill pages need
 * the chamber that signs regional bills and what that office is called.
 * Reading them from \`countryClientConfig\` shipped that whole 154 KB projection
 * (names, routes, currencies, central banks, election systems, descriptors) to
 * the browser for it; this file carries only the institutions those modules
 * read.
 *
 * \`countryOfficesClient.test.ts\` pins every entry, including the per-era
 * overlays, to \`COUNTRY_CLIENT_CONFIGS\`.
 */
import type { CountryId, GovernmentType } from "./countriesCore";

/** One chamber, as the office tables need it. */
export interface CountryOfficeChamberConfig {
  key: string;
  name: string;
  shortName: string;
  seats: number;
  elected?: boolean;
  regionElectedClasses?: boolean;
  regionalModel?: boolean;
}

/** The national chambers a country's offices sit in. */
export interface CountryOfficeLegislatureConfig {
  /** Chamber name for the whole legislature ("Congress", "Bundestag"). */
  name: string;
  lowerChamber: CountryOfficeChamberConfig;
  upperChamber?: CountryOfficeChamberConfig;
}

/** One office type an election can fill. */
export interface CountryOfficeTypeConfig {
  key: string;
  label: string;
  labelPlural: string;
  chamberKey?: string;
  isExecutive: boolean;
  isSubNational: boolean;
  isHeadOfState?: boolean;
}

/** Everything a country contributes to office resolution and the race filter. */
export interface CountryOfficeConfig {
  governmentType: GovernmentType;
  /** Era-neutral title of the office that signs or vetoes regional bills. */
  regionalBillAssentTitle?: string;
  legislature: CountryOfficeLegislatureConfig;
  subNationalChamber?: Pick<
    CountryOfficeChamberConfig,
    "key" | "name" | "shortName" | "regionalModel"
  >;
  officeTypes: CountryOfficeTypeConfig[];
  lowerElectionSystem: { snapElectionsAllowed: boolean };
  upperElectionSystem?: { snapElectionsAllowed: boolean };
}

/** Every country's chambers and offices. */
export const COUNTRY_OFFICES: Record<CountryId, CountryOfficeConfig> = ${literal(officeConfigs)};

/** Per-era chamber and office overlays, applied by {@link getCountryOfficeConfig}. */
const COUNTRY_OFFICE_ERA_OVERRIDES: Record<
  string,
  Partial<Record<CountryId, Partial<CountryOfficeConfig>>>
> = ${literal(officeEraOverrides)};

/** Client-safe office config for a country, honoring a preset's overlays. */
export function getCountryOfficeConfig(id: CountryId, preset?: string): CountryOfficeConfig {
  const base = COUNTRY_OFFICES[id];
  const override = preset ? COUNTRY_OFFICE_ERA_OVERRIDES[preset]?.[id] : undefined;
  if (!override) return base;
  return { ...base, ...override };
}

/** \`COUNTRY_OFFICES[id].officeTypes\` entry for one office key, or undefined. */
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
const REGIONAL_BILL_ASSENT_OFFICE_KEY: Partial<Record<CountryId, string>> = ${literal(
  regionalAssentOfficeKeys
)};

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

/** The United Kingdom's id, for the region-specific executive titles below. */
const UK_COUNTRY_ID: CountryId = "UK";

/**
 * Region-aware regional-executive label. Two countries give particular regions
 * a distinct title (London's mayor, Ireland's lord mayors and mayors), so the
 * plain country title is not always what the page should print.
 */
export function getRegionalBillAssentTitleForState(
  countryId: CountryId,
  stateId: string | undefined | null
): string {
  if (countryId === UK_COUNTRY_ID && stateId && stateId.toUpperCase() === "LON") {
    return "Mayor of London";
  }
  if (countryId === "IE" && stateId) {
    const upper = stateId.toUpperCase();
    if (upper === "DUB") return "Lord Mayor of Dublin";
    if (upper === "COR") return "Lord Mayor of Cork";
    if (upper === "LIM") return "Mayor of Limerick";
    if (upper === "GAL") return "Mayor of Galway";
  }
  return getRegionalBillAssentTitle(countryId);
}
`;

async function format(source: string): Promise<string> {
  const prettier = await import("prettier");
  const config = (await prettier.resolveConfig(OUT)) ?? {};
  return prettier.format(source, { ...config, parser: "typescript" });
}

async function main(): Promise<void> {
  const formatted = await format(text);
  writeFileSync(OUT, formatted);
  console.log(`wrote ${OUT} (${formatted.length} bytes) from ${ids.length} countries`);

  const officesFormatted = await format(officeText);
  writeFileSync(OFFICES_OUT, officesFormatted);
  console.log(
    `wrote ${OFFICES_OUT} (${officesFormatted.length} bytes) from ${ids.length} countries`
  );
}

void main();
