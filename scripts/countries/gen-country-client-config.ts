/**
 * Writes each country's `data/clientConfig.json` and `data/officesClient.json`
 * from the full registry. `constants/countryClientConfig.ts` and
 * `constants/countryOfficesClient.ts` compose them.
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
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  COUNTRY_CONFIGS,
  DEFAULT_LEGACY_COUNTRY_ID,
  ERA_COUNTRY_CONFIG_OVERRIDES,
  ERA_COUNTRY_NAMES,
  NATIONAL_ADDRESS_NAME,
  REGIONAL_BILL_ASSENT_OFFICE_KEY,
} from "../../src/lib/constants/countries";
import type { CountryId } from "../../src/lib/constants/countriesCore";

const OUT_DIR = "src/lib/countries";

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
  regionLabel: true,
  regionalBillAssentTitle: true,
  legislature: {
    name: true,
    lowerChamber: {
      key: true,
      name: true,
      shortName: true,
      seats: true,
      description: true,
      regionElectedClasses: true,
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

/**
 * `undefined` cannot be written to JSON, and an era override uses it to clear a
 * base field. It is written as `null`; the loader turns it back.
 */
function jsonSafe(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(jsonSafe);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonSafe(v)]));
}

function byCountry(overrides: Record<string, Record<string, unknown>>, id: string) {
  const out: Record<string, unknown> = {};
  for (const [preset, rows] of Object.entries(overrides)) {
    if (rows[id] !== undefined) out[preset] = jsonSafe(rows[id]);
  }
  return out;
}

async function format(source: string, path: string): Promise<string> {
  const prettier = await import("prettier");
  const config = (await prettier.resolveConfig(path)) ?? {};
  return prettier.format(source, { ...config, parser: "json" });
}

async function writeCountryFile(id: string, name: string, body: Record<string, unknown>) {
  const path = `${OUT_DIR}/${id.toLowerCase()}/data/${name}.json`;
  mkdirSync(dirname(path), { recursive: true });
  const formatted = await format(JSON.stringify(jsonSafe(body)), path);
  writeFileSync(path, formatted);
}

async function main(): Promise<void> {
  for (const id of ids) {
    const eraOverridesForId = byCountry(eraOverrides, id);
    const eraNamesForId: Record<string, string> = {};
    for (const [preset, names] of Object.entries(eraNames)) {
      if (names[id]) eraNamesForId[preset] = names[id];
    }
    await writeCountryFile(id, "clientConfig", {
      config: clientConfigs[id],
      ...(Object.keys(eraOverridesForId).length > 0 ? { eraOverrides: eraOverridesForId } : {}),
      ...(Object.keys(eraNamesForId).length > 0 ? { eraNames: eraNamesForId } : {}),
      ...(nationalAddressNames[id] ? { nationalAddressName: nationalAddressNames[id] } : {}),
      ...(regionalAssentOfficeKeys[id]
        ? { regionalAssentOfficeKey: regionalAssentOfficeKeys[id] }
        : {}),
    });
    const officeOverridesForId = byCountry(officeEraOverrides, id);
    await writeCountryFile(id, "officesClient", {
      config: officeConfigs[id],
      ...(Object.keys(officeOverridesForId).length > 0
        ? { eraOverrides: officeOverridesForId }
        : {}),
      ...(regionalAssentOfficeKeys[id]
        ? { regionalAssentOfficeKey: regionalAssentOfficeKeys[id] }
        : {}),
    });
  }
  console.log(`wrote client config and office JSON for ${ids.length} countries`);
}

void main();
