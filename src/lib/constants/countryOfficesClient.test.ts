import { describe, expect, it } from "vitest";

import { ERA_COUNTRY_CONFIG_OVERRIDES, type CountryId } from "./countries";
import {
  COUNTRY_CLIENT_CONFIGS,
  getCountryClientConfig,
  getRegionalBillAssentTitle as getClientAssentTitle,
  getRegionalBillAssentTitleForState as getClientAssentTitleForState,
  getRegionalExecutiveOfficeKey as getClientExecutiveOfficeKey,
  getOfficeTypeConfig as getClientOfficeTypeConfig,
} from "./countryClientConfig";
import {
  COUNTRY_OFFICES,
  getCountryOfficeConfig,
  getRegionalBillAssentTitle,
  getRegionalBillAssentTitleForState,
  getRegionalExecutiveOfficeKey,
  getCountryOfficeType,
} from "./countryOfficesClient";

/**
 * The office projection must stay a faithful copy of the client config.
 *
 * ⚠️ WHY THIS TEST EXISTS. `countryOfficesClient.ts` is generated from the
 * same registry as `countryClientConfig.ts`, and it is what the elections list
 * groups races by and what `officeResolution.ts` maps an election type
 * through. A seed edit that renames a chamber or re-keys an office would
 * otherwise ship a stale copy and file races under the wrong heading, with no
 * failure anywhere. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-client-config.ts
 *
 * It walks the generated value rather than listing fields, so the projection
 * is compared leaf by leaf without a second copy of the contract.
 */
const REGENERATE = "npx tsx scripts/countries/gen-country-client-config.ts";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function collectMismatches(
  full: unknown,
  client: unknown,
  path: string,
  mismatches: string[]
): void {
  if (Array.isArray(client)) {
    if (!Array.isArray(full)) {
      mismatches.push(`${path}: office value is an array, client config value is not`);
      return;
    }
    if (full.length !== client.length) {
      mismatches.push(
        `${path}: office has ${client.length} entries, client config has ${full.length}`
      );
      return;
    }
    client.forEach((entry, index) =>
      collectMismatches(full[index], entry, `${path}[${index}]`, mismatches)
    );
    return;
  }
  if (isPlainObject(client)) {
    if (!isPlainObject(full)) {
      mismatches.push(`${path}: office value is an object, client config value is not`);
      return;
    }
    for (const [key, value] of Object.entries(client)) {
      if (!Object.hasOwn(full, key)) {
        mismatches.push(`${path}.${key}: the client config has no such field`);
        continue;
      }
      collectMismatches(full[key], value, `${path}.${key}`, mismatches);
    }
    return;
  }
  if (!Object.is(full, client)) {
    mismatches.push(
      `${path}: office ${JSON.stringify(client)} != client config ${JSON.stringify(full)}`
    );
  }
}

function expectParity(full: unknown, offices: unknown, label: string): void {
  const mismatches: string[] = [];
  collectMismatches(full, offices, label, mismatches);
  expect(
    mismatches,
    `\n${label} drifted from countryClientConfig in ${mismatches.length} place(s):\n` +
      mismatches.map((m) => `  ${m}`).join("\n") +
      `\n\ncountryOfficesClient.ts is generated. Regenerate it:\n\n  ${REGENERATE}\n`
  ).toEqual([]);
}

const COUNTRY_IDS = Object.keys(COUNTRY_CLIENT_CONFIGS) as CountryId[];
const PRESETS = Object.keys(ERA_COUNTRY_CONFIG_OVERRIDES);

describe("countryOfficesClient matches countryClientConfig", () => {
  it("has exactly the same country keys", () => {
    expect(Object.keys(COUNTRY_OFFICES).sort()).toEqual([...COUNTRY_IDS].sort());
  });

  it.each(COUNTRY_IDS)("%s carries the same chambers and offices", (id) => {
    expectParity(COUNTRY_CLIENT_CONFIGS[id], COUNTRY_OFFICES[id], id);
  });

  it.each(PRESETS)("%s carries the same era overlay", (preset) => {
    for (const id of COUNTRY_IDS) {
      expectParity(
        getCountryClientConfig(id, preset),
        getCountryOfficeConfig(id, preset),
        `${preset}.${id}`
      );
    }
  });

  it("resolves the same office type for every office key", () => {
    for (const id of COUNTRY_IDS) {
      for (const office of COUNTRY_CLIENT_CONFIGS[id].officeTypes) {
        expect(getCountryOfficeType(id, office.key)).toEqual(
          getClientOfficeTypeConfig(id, office.key)
        );
      }
      expect(getCountryOfficeType(id, "no-such-office")).toBeUndefined();
    }
  });

  it("resolves the same regional executive office and title", () => {
    for (const id of COUNTRY_IDS) {
      expect(getRegionalExecutiveOfficeKey(id)).toBe(getClientExecutiveOfficeKey(id));
      expect(getRegionalBillAssentTitle(id)).toBe(getClientAssentTitle(id));
    }
  });

  it("resolves the same region-specific assent title", () => {
    const regionIds = ["LON", "DUB", "COR", "LIM", "GAL", "CA", "NY", "WAL"];
    for (const id of COUNTRY_IDS) {
      for (const regionId of regionIds) {
        expect(getRegionalBillAssentTitleForState(id, regionId)).toBe(
          getClientAssentTitleForState(id, regionId)
        );
      }
      expect(getRegionalBillAssentTitleForState(id, null)).toBe(
        getClientAssentTitleForState(id, null)
      );
    }
  });
});
